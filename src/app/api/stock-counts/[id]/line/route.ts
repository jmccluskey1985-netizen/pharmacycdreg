import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { balancesFor } from '@/lib/registers';

export const dynamic = 'force-dynamic';
const Body = z.object({
  register_id: z.string().uuid(),
  counted: z.union([z.coerce.number().min(0), z.null()]).optional(),
  note: z.string().trim().max(500).optional().nullable(),
  counted_at: z.string().datetime({ offset: true }).optional().nullable(),
  complete: z.boolean().optional(),
});

/**
 * Save one line of an open count. A new or changed count takes the register balance at that
 * moment (stock moves during a count that runs over days) and the time it was counted, unless a
 * date is given. Clearing the count clears the line's balance and date.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { account, staff } = await requireStaff('stockCheck', { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the amount' }, { status: 400 });
    const b = parsed.data;
    const db = createServiceClient();
    const { data: count } = await db.from('stock_counts').select('id, status').eq('id', id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!count) return NextResponse.json({ error: 'Count not found' }, { status: 404 });
    if (count.status !== 'open') return NextResponse.json({ error: 'This count is finished and can’t be changed' }, { status: 409 });
    const { data: reg } = await db.from('cd_registers').select('id').eq('id', b.register_id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const { data: prev } = await db.from('stock_count_lines').select('*').eq('count_id', id).eq('register_id', b.register_id).maybeSingle();
    if (prev?.stock_check_id) return NextResponse.json({ error: 'This line is complete and logged in its book; it can’t be changed' }, { status: 409 });

    const row: Record<string, unknown> = { count_id: id, register_id: b.register_id, updated_at: new Date().toISOString() };
    if (b.note !== undefined) row.note = b.note || null;
    if (b.counted !== undefined) {
      if (b.counted === null) Object.assign(row, { counted: null, balance_at_count: null, counted_at: null, counted_by_staff_id: null, counted_by_name: null });
      else if (!prev || Number(prev.counted) !== b.counted || prev.counted === null) {
        const balance = (await balancesFor([b.register_id]))[b.register_id] ?? 0;
        Object.assign(row, { counted: b.counted, balance_at_count: balance, counted_at: b.counted_at ?? new Date().toISOString(), counted_by_staff_id: staff.id, counted_by_name: staff.full_name });
      }
    }
    if (b.counted_at && prev?.counted !== null && b.counted === undefined) row.counted_at = b.counted_at;
    const { data, error } = prev
      ? await db.from('stock_count_lines').update(row).eq('id', prev.id).select('*').single()
      : await db.from('stock_count_lines').insert(row).select('*').single();
    if (error) throw error;

    // Complete the row: log it in its book as a permanent stock check, and lock the row
    if (b.complete) {
      if (data.counted === null) return NextResponse.json({ error: 'Enter the count first', line: data }, { status: 400 });
      if (Number(data.counted) !== Number(data.balance_at_count) && !data.note) return NextResponse.json({ error: 'The count doesn’t match the register: add a note on what you found first', line: data }, { status: 400 });
      const { data: check, error: e2 } = await db.from('stock_checks').insert({
        pharmacy_id: account.pharmacyId, register_id: data.register_id, counted: data.counted, register_balance: data.balance_at_count,
        notes: data.note || null, checked_by_staff_id: data.counted_by_staff_id ?? staff.id, checked_by_name: data.counted_by_name ?? staff.full_name, checked_at: data.counted_at ?? new Date().toISOString(),
      }).select('id').single();
      if (e2) throw e2;
      const { data: done } = await db.from('stock_count_lines').update({ stock_check_id: check.id, updated_at: new Date().toISOString() }).eq('id', data.id).select('*').single();
      const diff = Number(data.counted) - Number(data.balance_at_count);
      await audit(account.pharmacyId, diff === 0 ? 'stock_check.correct' : 'stock_check.discrepancy', staff, account.authUserId, { register_id: data.register_id, counted: Number(data.counted), balance: Number(data.balance_at_count), diff, stock_count_id: id }, { table: 'stock_checks', id: check.id });
      return NextResponse.json({ line: done });
    }
    return NextResponse.json({ line: data });
  } catch (err) {
    return errorResponse(err);
  }
}
