import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy, currentBalance } from '@/lib/registers';
import { EntrySchema, STOCK_EFFECT } from '@/lib/entry-schema';
import { can } from '@/lib/roles';

// Make a register entry. Append-only: corrections are new rows (FR10/FR11). The audit
// row is written by a database trigger, so it can't be skipped from here.
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = EntrySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Some required register details are missing', issues: parsed.error.flatten() }, { status: 400 });
    }
    const e = parsed.data;
    const reg = await getRegisterForPharmacy(e.register_id, account.pharmacyId);
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    if (reg.closed_at) return NextResponse.json({ error: 'This register is closed' }, { status: 409 });

    const db = createServiceClient();
    const balance = await currentBalance(reg.id);
    let resulting = balance;

    if (e.entry_type === 'correction') {
      const { data: orig } = await db.from('cd_ledger').select('*').eq('id', e.corrects_entry_id).eq('register_id', reg.id).maybeSingle();
      if (!orig) return NextResponse.json({ error: 'The entry being corrected was not found in this register' }, { status: 404 });
      const effect = STOCK_EFFECT[orig.entry_type] ?? 0;
      resulting = balance + effect * (e.quantity - Number(orig.quantity));
    } else {
      resulting = balance + (STOCK_EFFECT[e.entry_type] ?? 0) * e.quantity;
    }
    if (resulting < 0) {
      return NextResponse.json(
        { error: `This would take the balance below zero (current ${balance} ${reg.product.unit}). Check the quantity or record the missing receipt first.` },
        { status: 409 },
      );
    }

    const row: Record<string, unknown> = { ...e, recorded_by_staff_id: staff.id, recorded_by_auth_user: account.authUserId, source: e.scan_id ? 'scan' : 'manual' };
    if (e.entry_type === 'correction') {
      // Carry forward the original's fields the correction didn't change, so the effective row is complete.
      const { data: orig } = await db.from('cd_entries').select('*').eq('id', e.corrects_entry_id).single();
      for (const k of ['supplier_name', 'supplier_address', 'recipient_name', 'recipient_address', 'prescriber_name', 'prescriber_address', 'authority_to_possess', 'prescription_ref', 'witness_name', 'witness_role', 'collected_by', 'collector_id_checked', 'destruction_method']) {
        if (row[k] === undefined || row[k] === null || row[k] === '') row[k] = orig[k];
      }
    }
    const { data, error } = await db.from('cd_entries').insert(row).select('id, seq').single();
    if (error) {
      if (error.code === '23514') return NextResponse.json({ error: 'A mandatory register field is missing' }, { status: 400 });
      throw error;
    }
    return NextResponse.json({ id: data.id, seq: data.seq, balance: resulting });
  } catch (err) {
    return errorResponse(err);
  }
}
