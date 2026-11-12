import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';

// Reveals the sign-in form when the right access code is entered. The code lives in
// SIGNIN_UNLOCK_CODE (Vercel env), never in the public repo or the browser bundle.
// This only hides the form: the account password and staff PIN still protect access.
export async function POST(req: Request) {
  const limit = checkRateLimit(`access:${clientKey(req)}`, 8, 15 * 60_000);
  if (!limit.ok) return NextResponse.json({ ok: false, error: 'Too many attempts — try again later.' }, { status: 429 });
  const expected = process.env.SIGNIN_UNLOCK_CODE?.trim();
  if (!expected) return NextResponse.json({ ok: false, error: 'Access code not set up yet (SIGNIN_UNLOCK_CODE).' }, { status: 503 });
  const { code } = await req.json().catch(() => ({}));
  const a = Buffer.from(String(code ?? '').trim());
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return NextResponse.json({ ok, error: ok ? undefined : 'Code not recognised' }, { status: ok ? 200 : 401 });
}
