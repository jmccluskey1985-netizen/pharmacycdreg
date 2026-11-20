import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email';
import { authLink, normEmail, resetEmail } from '@/lib/auth-emails';

export const dynamic = 'force-dynamic';

/**
 * Forgot password. Always gives the same answer whether or not the email has a login (so it
 * can't be used to find out who's a customer), limits requests per address and per network,
 * and sends a one-time, 1-hour link from support@.
 */
export async function POST(req: Request) {
  const done = NextResponse.json({ ok: true, message: 'If that email has an account, a reset link is on its way. Check your inbox and spam; it expires in 1 hour.' });
  const parsed = z.object({ email: z.string().trim().email().max(200) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your email address' }, { status: 400 });
  const email = normEmail(parsed.data.email);
  const perIp = await checkRateLimit(`forgot:ip:${clientKey(req)}`, 10, 60 * 60_000);
  const perEmail = await checkRateLimit(`forgot:email:${email}`, 3, 60 * 60_000);
  if (!perIp.ok) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429, headers: { 'Retry-After': String(perIp.retryAfter) } });
  if (!perEmail.ok) return done; // quietly: don't reveal anything, don't flood the inbox
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const { link } = await authLink(email, 'recovery', site);
    if (link) {
      const m = resetEmail(link);
      await sendEmail({ to: email, subject: m.subject, html: m.html });
    }
  } catch (e) {
    console.error('[forgot] failed', (e as Error).message);
  }
  return done;
}
