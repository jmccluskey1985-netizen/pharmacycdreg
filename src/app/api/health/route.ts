import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** For an uptime monitor: 200 when the app and the database answer, 503 otherwise. No data returned. */
export async function GET() {
  const started = Date.now();
  try {
    const db = createServiceClient();
    const { error } = await db.from('pharmacies').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, db: 'ok', ms: Date.now() - started, region: process.env.VERCEL_REGION ?? null });
  } catch {
    return NextResponse.json({ ok: false, db: 'down', ms: Date.now() - started }, { status: 503 });
  }
}
