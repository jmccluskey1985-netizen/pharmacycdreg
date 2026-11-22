import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** The open stock count (or ?id= a past one) with its lines, and the list of past counts. */
export async function GET(req: Request) {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const id = new URL(req.url).searchParams.get('id');
    const { data: counts, error } = await db.from('stock_counts').select('*').eq('pharmacy_id', account.pharmacyId).order('started_at', { ascending: false }).limit(30);
    if (error) return NextResponse.json({ error: 'Needs a one-off database update first (migration 0026).' }, { status: 503 });
    // The open count, else the latest finished one (read-only) until a new count is started
    const count = id ? counts?.find((c) => c.id === id) ?? null : counts?.find((c) => c.status === 'open') ?? counts?.[0] ?? null;
    const { data: lines } = count ? await db.from('stock_count_lines').select('*').eq('count_id', count.id) : { data: [] };
    return NextResponse.json({ count, lines: lines ?? [], counts: (counts ?? []).map((c) => ({ id: c.id, status: c.status, started_at: c.started_at, finished_at: c.finished_at })) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Start a count (one open count per pharmacy). */
export async function POST() {
  try {
    const { account, staff } = await requireStaff('stockCheck', { write: true });
    const db = createServiceClient();
    const { data: open } = await db.from('stock_counts').select('*').eq('pharmacy_id', account.pharmacyId).eq('status', 'open').maybeSingle();
    if (open) return NextResponse.json({ count: open });
    const { data, error } = await db.from('stock_counts').insert({ pharmacy_id: account.pharmacyId, started_by_staff_id: staff.id, started_by_name: staff.full_name }).select('*').single();
    if (error) throw error;
    await audit(account.pharmacyId, 'stock_count.started', staff, account.authUserId, {}, { table: 'stock_counts', id: data.id });
    return NextResponse.json({ count: data });
  } catch (err) {
    return errorResponse(err);
  }
}
