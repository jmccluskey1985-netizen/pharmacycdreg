import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email';
import { passwordChangedEmail } from '@/lib/auth-emails';

export const dynamic = 'force-dynamic';

/** Called after a password is set: emails the login a security notice. */
export async function POST() {
  const sb = await createServerSupabaseClient();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await checkRateLimit(`pwchanged:${user.id}`, 3, 60 * 60_000)).ok) return NextResponse.json({ ok: true });
  const m = passwordChangedEmail(new Date());
  await sendEmail({ to: user.email, subject: m.subject, html: m.html }).catch(() => {});
  return NextResponse.json({ ok: true });
}
