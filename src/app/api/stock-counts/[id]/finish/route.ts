import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Finish a count: every counted line becomes a permanent stock check (count, the balance when it
 * was counted, note, who and when). Lines that don't match need a note first, as for a single
 * stock check. After this the count can't be changed.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { account, staff } = await requireStaff('stockCheck', { write: true });
    const db = createServiceClient();
    const { data: count } = await db.from('stock_counts').select('*').eq('id', id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!count) return NextResponse.json({ error: 'Count not found' }, { status: 404 });
    if (count.status !== 'open') return NextResponse.json({ error: 'This count is already finished' }, { status: 409 });
    const { data: lines } = await db.from('stock_count_lines').select('*').eq('count_id', id).not('counted', 'is', null);
    if (!(lines ?? []).length) return NextResponse.json({ error: 'Count at least one book first' }, { status: 400 });
    const counted = (lines ?? []).filter((l) => !l.stock_check_id); // rows already completed are logged
    const noNote = counted.filter((l) => Number(l.counted) !== Number(l.balance_at_count) && !l.note);
    if (noNote.length) return NextResponse.json({ error: `${noNote.length} line${noNote.length === 1 ? '' : 's'} don’t match the register: add a note on what you found first`, register_ids: noNote.map((l) => l.register_id) }, { status: 400 });

    for (const l of counted) {
      const { data: check, error } = await db.from('stock_checks').insert({
        pharmacy_id: account.pharmacyId, register_id: l.register_id, counted: l.counted, register_balance: l.balance_at_count,
        notes: l.note || null, checked_by_staff_id: l.counted_by_staff_id ?? staff.id, checked_by_name: l.counted_by_name ?? staff.full_name, checked_at: l.counted_at ?? new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      await db.from('stock_count_lines').update({ stock_check_id: check.id }).eq('id', l.id);
    }
    await db.from('stock_counts').update({ status: 'finished', finished_at: new Date().toISOString(), finished_by_staff_id: staff.id, finished_by_name: staff.full_name }).eq('id', id);
    const all = lines ?? [];
    const diffs = all.filter((l) => Number(l.counted) !== Number(l.balance_at_count)).length;
    await audit(account.pharmacyId, 'stock_count.finished', staff, account.authUserId, { lines: all.length, newly_logged: counted.length, differences: diffs }, { table: 'stock_counts', id });
    return NextResponse.json({ ok: true, recorded: all.length, differences: diffs });
  } catch (err) {
    return errorResponse(err);
  }
}
