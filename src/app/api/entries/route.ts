import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy, currentBalance } from '@/lib/registers';
import { EntrySchema, STOCK_EFFECT } from '@/lib/entry-schema';
import { can } from '@/lib/roles';
import { findOrCreatePatient } from '@/lib/patients';

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

    const { inbox_id, ...fields } = e as typeof e & { inbox_id?: string | null };
    if (inbox_id) {
      const { data: ib } = await db.from('pmr_inbox').select('status').eq('id', inbox_id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
      if (!ib || ib.status !== 'pending') return NextResponse.json({ error: 'This Halo item was already dealt with' }, { status: 409 });
    }
    // Patient record: use the one picked (must be this pharmacy's), else find/create one by
    // name + address so every supplied patient builds up a record. Skipped before migration 0008.
    const dob = (fields as any).patient_dob ?? null;
    delete (fields as any).patient_dob; // not a register column
    if (fields.entry_type === 'supply' || fields.entry_type === 'patient_return') {
      const f = fields as any;
      if (f.patient_id) {
        const { data: pt } = await db.from('patients').select('id').eq('id', f.patient_id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
        if (!pt) delete f.patient_id;
      } else {
        const id = await findOrCreatePatient(db, account.pharmacyId, f.recipient_name, f.recipient_address ?? null, f.entry_type === 'supply' ? { name: f.prescriber_name ?? null, address: f.prescriber_address ?? null } : undefined, dob).catch(() => null);
        if (id) f.patient_id = id; else delete f.patient_id;
      }
    }
    const row: Record<string, unknown> = { ...fields, recorded_by_staff_id: staff.id, recorded_by_auth_user: account.authUserId, source: inbox_id ? 'pmr' : e.scan_id ? 'scan' : 'manual' };
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
    // Remember the supplier (and its address) for quick-fill next time.
    if (row.entry_type === 'receipt' && typeof row.supplier_name === 'string' && row.supplier_name.trim().length >= 2 && row.supplier_name !== 'Balance brought forward') {
      try {
        const name = (row.supplier_name as string).trim();
        const address = typeof row.supplier_address === 'string' && row.supplier_address.trim() ? row.supplier_address.trim() : null;
        const { data: c } = await db.from('contacts').select('id, address').eq('pharmacy_id', account.pharmacyId).eq('kind', 'supplier').eq('is_active', true).ilike('name', name).limit(1);
        if (!c?.length) await db.from('contacts').insert({ pharmacy_id: account.pharmacyId, kind: 'supplier', name, address });
        else if (address && c[0].address !== address) await db.from('contacts').update({ address, updated_at: new Date().toISOString() }).eq('id', c[0].id);
      } catch { /* quick-fill only; never block a register entry */ }
    }
    if (inbox_id) {
      await db.from('pmr_inbox').update({ status: 'posted', entry_id: data.id, register_id: reg.id, resolved_by_staff_id: staff.id, resolved_at: new Date().toISOString() }).eq('id', inbox_id);
    }
    return NextResponse.json({ id: data.id, seq: data.seq, balance: resulting });
  } catch (err) {
    return errorResponse(err);
  }
}
