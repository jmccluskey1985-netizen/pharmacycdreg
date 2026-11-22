import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy } from '@/lib/registers';

export const dynamic = 'force-dynamic';

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// FR16 / NFR11 / NFR13: reproduce the register for an authorised officer.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { account, staff } = await requireStaff();
    const reg = await getRegisterForPharmacy(params.id, account.pharmacyId);
    if (!reg) return new Response('Not found', { status: 404 });
    const db = createServiceClient();
    const [{ data: rows }, { data: people }, { data: checks }] = await Promise.all([
      db.from('cd_ledger').select('*').eq('register_id', reg.id).order('seq'),
      db.from('staff').select('id, full_name, psi_number').eq('pharmacy_id', account.pharmacyId),
      db.from('stock_checks').select('counted, register_balance, notes, checked_by_staff_id, checked_by_name, checked_at').eq('pharmacy_id', account.pharmacyId).eq('register_id', reg.id).order('checked_at'),
    ]);
    const who = new Map((people ?? []).map((p) => [p.id, `${p.full_name}${p.psi_number ? ` (PSI ${p.psi_number})` : ''}`]));
    const header = ['Line', 'Date', 'Type', 'Name & address (obtained from / supplied to)', 'Authority to possess / prescriber', 'Obtained', 'Supplied', 'Stock balance', 'Pharmacist', 'Recorded at', 'Corrected', 'Correction reason', 'Witness'];
    const entryLines = (rows ?? []).map((r: any) => {
      const party = r.entry_type === 'receipt'
        ? `${r.supplier_name}, ${r.supplier_address}`
        : r.entry_type.startsWith('adjustment') ? `Stock adjustment: ${r.notes ?? ''}`
        : r.recipient_name ? `${r.recipient_name}, ${r.recipient_address}` : r.entry_type.replace(/_/g, ' ');
      const authority = [r.authority_to_possess, r.prescriber_name, r.prescriber_address, r.prescription_ref].filter(Boolean).join('; ');
      const obtained = ['receipt', 'adjustment_in'].includes(r.entry_type) ? r.quantity : '';
      const supplied = ['supply', 'destruction', 'adjustment_out'].includes(r.entry_type) ? r.quantity : r.entry_type === 'patient_return_destruction' ? `${r.quantity} (patient return)` : '';
      return { at: r.recorded_at as string, text: [r.seq, r.transaction_date, r.entry_type, party, authority, obtained, supplied, r.running_balance, who.get(r.recorded_by_staff_id) ?? '', r.recorded_at, r.correction_count > 0 ? 'Yes' : '', r.correction_reason ?? '', r.witness_name ? `${r.witness_name} (${r.witness_role})` : ''].map(csv).join(',') };
    });
    // Completed stock checks, in time order among the entries
    const checkLines = (checks ?? []).map((c: any) => {
      const diff = Number(c.counted) - Number(c.register_balance);
      const what = diff === 0 ? `Stock check: balance confirmed correct (${c.counted} counted)` : `Stock check: counted ${c.counted}, register ${c.register_balance}, difference ${diff > 0 ? '+' : ''}${diff}`;
      return { at: c.checked_at as string, text: ['', String(c.checked_at).slice(0, 10), 'stock_check', what, c.notes ?? '', '', '', c.register_balance, (c.checked_by_staff_id && who.get(c.checked_by_staff_id)) || c.checked_by_name, c.checked_at, '', '', ''].map(csv).join(',') };
    });
    const lines = [...entryLines, ...checkLines].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).map((l) => l.text);
    const p = reg.product;
    const title = `Register of Controlled Drugs: ${p.class_name}: ${p.drug_name} ${p.strength} ${p.form}`;
    await audit(account.pharmacyId, 'register.exported', staff, account.authUserId, { format: 'csv' }, { table: 'cd_registers', id: reg.id });
    return new Response([csv(title), header.join(','), ...lines].join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cd-register-${p.drug_name.replace(/\W+/g, '-')}-${p.strength.replace(/\W+/g, '')}.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
