import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit, HttpError } from '@/lib/access';
import { isSiteAdmin } from '@/lib/admin';
import { emailStatus, sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Site owner only (ADMIN_EMAILS): check the email set-up without signing up a test pharmacy.
async function owner() {
  const ctx = await requireStaff();
  if (!isSiteAdmin(ctx.account.email)) throw new HttpError(404, 'Not found');
  return ctx;
}

export async function GET() {
  try {
    const { account } = await owner();
    return NextResponse.json({ ...emailStatus(), my_email: account.email });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({ to: z.string().trim().email().max(200), sender: z.enum(['welcome', 'support']) });

export async function POST(req: Request) {
  try {
    const { account, staff } = await owner();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Enter an email address to send the test to' }, { status: 400 });
    const { to, sender } = parsed.data;
    const st = emailStatus();
    if (!st.on || !st.has_key || !st.service_account) {
      return NextResponse.json({ ok: false, message: 'Email isn’t switched on: EMAIL_FROM, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must all be set in Vercel (Production), then redeploy.' });
    }
    const from = sender === 'welcome' ? st.welcome_from : st.support_from;
    const r = await sendEmail({
      to, sender,
      subject: `PharmacyCDReg.ie test email from ${from}`,
      html: `<p>This is a test from <b>${from}</b>.</p><p>If it arrived, email is working. Check that the sender shows as <b>${st.from_name} &lt;${from}&gt;</b>, not ${st.mailbox}, and that it didn’t land in spam.</p><p>Replying goes to ${st.support_from}.</p>`,
    });
    await audit(account.pharmacyId, 'email.test', staff, account.authUserId, { sender, sent: !!r.sent });
    return NextResponse.json(r.sent
      ? { ok: true, message: `Sent from ${from} to ${to}. Check the inbox (and spam): the sender should read “${st.from_name} <${from}>”. If it shows ${st.mailbox} instead, add ${from} under Gmail → Settings → Accounts → Send mail as, in that mailbox.` }
      : { ok: false, message: `Not sent. ${'error' in r && r.error ? r.error : 'See Vercel logs for “[email]”.'}` });
  } catch (err) {
    return errorResponse(err);
  }
}
