import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Every register for this premises in one file, including corrections and who
// made each entry. Business continuity / NFR15–16: keep a recent local copy so
// the register is available even without internet. Read-only accounts can use it.
export async function GET() {
  try {
    const { account, staff } = await requireStaff();
    const db = createServiceClient();
    const [{ data: pharmacy }, { data: regs }, { data: people }] = await Promise.all([
      db.from('pharmacies').select('name, address, psi_premises_number').eq('id', account.pharmacyId).single(),
      db.from('cd_registers').select('id, opened_at, closed_at, product:cd_products(*)').eq('pharmacy_id', account.pharmacyId),
      db.from('staff').select('id, full_name, psi_number').eq('pharmacy_id', account.pharmacyId),
    ]);
    const regMap = new Map((regs ?? []).map((r: any) => [r.id, r]));
    const who = new Map((people ?? []).map((p) => [p.id, `${p.full_name}${p.psi_number ? ` (PSI ${p.psi_number})` : ''}`]));
    const ids = Array.from(regMap.keys());
    const { data: entries } = ids.length
      ? await db.from('cd_entries').select('*').in('register_id', ids).order('register_id').order('seq')
      : { data: [] as any[] };
    const { data: ledger } = ids.length
      ? await db.from('cd_ledger').select('id, running_balance').in('register_id', ids)
      : { data: [] as any[] };
    const bal = new Map((ledger ?? []).map((l: any) => [l.id, l.running_balance]));

    const header = ['Schedule', 'Class of drug', 'Product', 'Unit', 'Line', 'Entry type', 'Transaction date', 'Recorded at', 'Obtained from / supplied to', 'Address', 'Authority / prescriber', 'Rx / ref', 'Amount', 'Running balance (effective)', 'Witness', 'Corrects line', 'Correction reason', 'Pharmacist', 'Source'];
    const lines = (entries ?? []).map((e: any) => {
      const r: any = regMap.get(e.register_id);
      const p = r?.product ?? {};
      const corrects = e.corrects_entry_id ? (entries ?? []).find((x: any) => x.id === e.corrects_entry_id)?.seq : '';
      return [
        `${p.schedule}${p.schedule_paragraph ? ` ${p.schedule_paragraph}` : ''}`, p.class_name, `${p.drug_name} ${p.strength} ${p.form}`, p.unit,
        e.seq, e.entry_type, e.transaction_date, e.recorded_at,
        e.entry_type === 'receipt' ? e.supplier_name : e.recipient_name, e.entry_type === 'receipt' ? e.supplier_address : e.recipient_address,
        [e.authority_to_possess, e.prescriber_name].filter(Boolean).join('; '), e.prescription_ref, e.quantity, bal.get(e.id) ?? '',
        e.witness_name ? `${e.witness_name} (${e.witness_role})` : '', corrects, e.correction_reason, who.get(e.recorded_by_staff_id) ?? '', e.source,
      ].map(csv).join(',');
    });
    const title = `Register of Controlled Drugs — ${pharmacy?.name ?? ''}, ${pharmacy?.address ?? ''}${pharmacy?.psi_premises_number ? ` (PSI ${pharmacy.psi_premises_number})` : ''} — exported ${new Date().toISOString()}`;
    await audit(account.pharmacyId, 'register.exported_all', staff, account.authUserId, { rows: lines.length });
    return new Response([csv(title), header.join(','), ...lines].join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cd-register-all-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
