import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Browser errors are written to the server log (Vercel → Logs), so a broken page is seen
// without a phone call. Only the error message, page path and stack are kept. No form data.
const seen = new Map<string, number>();

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.message !== 'string') return NextResponse.json({ ok: false }, { status: 400 });
  const key = `${b.message}|${b.path}`.slice(0, 300);
  const now = Date.now();
  if ((seen.get(key) ?? 0) > now - 60_000) return NextResponse.json({ ok: true }); // de-duplicate bursts
  seen.set(key, now);
  if (seen.size > 500) seen.clear();
  console.error('[client-error]', JSON.stringify({
    message: String(b.message).slice(0, 500),
    path: String(b.path ?? '').replace(/[?#].*$/, '').slice(0, 200),
    digest: b.digest ? String(b.digest).slice(0, 100) : undefined,
    stack: b.stack ? String(b.stack).slice(0, 2000) : undefined,
  }));
  return NextResponse.json({ ok: true });
}
