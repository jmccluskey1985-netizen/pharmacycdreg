import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { findOrCreatePatient } from '@/lib/patients';
import { can } from '@/lib/roles';

// One-off: build patient records from everyone already supplied in the register
// (name, address and their latest prescriber). Safe to run more than once.
export async function POST() {
  try {
    const { account, staff } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const { data: regs } = await db.from('cd_registers').select('id').eq('pharmacy_id', account.pharmacyId);
    const ids = (regs ?? []).map((r) => r.id);
    if (!ids.length) return NextResponse.json({ added: 0 });
    const { data } = await db.from('cd_ledger').select('recipient_name, recipient_address, prescriber_name, prescriber_address, transaction_date').in('register_id', ids).eq('entry_type', 'supply').order('transaction_date', { ascending: false }).limit(5000);
    const seen = new Set<string>();
    let added = 0;
    const { count: before } = await db.from('patients').select('id', { count: 'exact', head: true }).eq('pharmacy_id', account.pharmacyId);
    for (const r of data ?? []) {
      if (!r.recipient_name) continue;
      const k = `${r.recipient_name}|${r.recipient_address ?? ''}`.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      await findOrCreatePatient(db, account.pharmacyId, r.recipient_name, r.recipient_address, { name: r.prescriber_name, address: r.prescriber_address });
    }
    const { count: after } = await db.from('patients').select('id', { count: 'exact', head: true }).eq('pharmacy_id', account.pharmacyId);
    added = (after ?? 0) - (before ?? 0);
    await audit(account.pharmacyId, 'patients.imported_from_register', staff, account.authUserId, { added });
    return NextResponse.json({ added });
  } catch (err) {
    return errorResponse(err);
  }
}
