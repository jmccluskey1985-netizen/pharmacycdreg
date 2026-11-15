import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit, HttpError } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/admin';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const norm = (e: string) => e.trim().toLowerCase().replace(/@googlemail\.com$/, '@gmail.com');
const Body = z.object({ email: z.string().trim().email().max(200).transform(norm), send_email: z.boolean().optional() });

async function owner() {
  const ctx = await requireStaff();
  if (!isSiteAdmin(ctx.account.email)) throw new HttpError(404, 'Not found');
  return ctx;
}

/** Site owner: emails allowed to create their own account while sign-ups are closed (migration 0019). */
export async function GET() {
  try {
    await owner();
    const { data, error } = await createServiceClient().from('signup_invites').select('email, invited_at, used_at').order('invited_at', { ascending: false }).limit(500);
    if (error) return NextResponse.json({ invites: [], needs_migration: true });
    return NextResponse.json({ invites: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { account, staff } = await owner();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 });
    const { email, send_email } = parsed.data;
    const db = createServiceClient();
    const { error } = await db.from('signup_invites').upsert({ email, invited_by: account.email, used_at: null }, { onConflict: 'email' });
    if (error) return NextResponse.json({ error: /signup_invites/.test(error.message) ? 'Run migration 0019 in Supabase first.' : error.message }, { status: 409 });
    const link = `${new URL(req.url).origin}/start`;
    let emailed = false;
    if (send_email !== false) {
      emailed = (await sendEmail({
        to: email,
        subject: 'Your invitation to PharmacyCDReg.ie',
        html: `<p>Hello,</p><p>You're invited to set up your pharmacy on <b>PharmacyCDReg.ie</b>, the electronic Controlled Drugs Register.</p><p><a href="${link}">Create your account</a> using this email address (${email}). Your free month starts straight away, with no card needed.</p><p>PharmacyCDReg.ie</p>`,
      })).sent;
    }
    await audit(account.pharmacyId, 'admin.signup_invited', staff, account.authUserId, { emailed });
    return NextResponse.json({ ok: true, emailed, link });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const { account, staff } = await owner();
    const email = norm(new URL(req.url).searchParams.get('email') ?? '');
    await createServiceClient().from('signup_invites').delete().eq('email', email).is('used_at', null);
    await audit(account.pharmacyId, 'admin.signup_invite_removed', staff, account.authUserId, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
