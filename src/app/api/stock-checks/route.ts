import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { balancesFor } from '@/lib/registers';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// History for one register (newest first).
export async function GET(req: Request) {
  try {
    const { account } = await requireStaff();
    const id = new URL(req.url).searchParams.get('register_id');
    if (!id) return NextResponse.json({ checks: [] });
    const db = createServiceClient();
    const { data, error } = await db.from('stock_checks').select('*').eq('pharmacy_id', account.pharmacyId).eq('register_id', id).order('checked_at', { ascending: false }).limit(50);
    return NextResponse.json({ checks: error ? [] : data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({ register_id: z.string().uuid(), counted: z.coerce.number().min(0), notes: z.string().trim().max(500).optional().nullable() });

// Record a physical count against the register balance. A difference is recorded, never "fixed":
// the pharmacist investigates and records any correction in the register itself.
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Enter the amount counted' }, { status: 400 });
    const b = parsed.data;
    const db = createServiceClient();
    const { data: reg } = await db.from('cd_registers').select('id').eq('id', b.register_id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const balance = (await balancesFor([b.register_id]))[b.register_id] ?? 0;
    const diff = b.counted - balance;
    if (diff !== 0 && !b.notes) return NextResponse.json({ error: 'The count doesn’t match the register. Add a note on what you found', mismatch: { balance, diff } }, { status: 400 });
    const { data, error } = await db.from('stock_checks').insert({ pharmacy_id: account.pharmacyId, register_id: b.register_id, counted: b.counted, register_balance: balance, notes: b.notes || null, checked_by_staff_id: staff.id, checked_by_name: staff.full_name }).select('*').single();
    if (error) {
      if (/relation|does not exist/i.test(error.message)) return NextResponse.json({ error: 'Stock checks need a one-off database update first (run migration 0007 in Supabase).' }, { status: 409 });
      throw error;
    }
    await audit(account.pharmacyId, diff === 0 ? 'stock_check.correct' : 'stock_check.discrepancy', staff, account.authUserId, { register_id: b.register_id, counted: b.counted, balance, diff }, { table: 'stock_checks', id: data.id });
    return NextResponse.json({ check: data, balance, diff });
  } catch (err) {
    return errorResponse(err);
  }
}
