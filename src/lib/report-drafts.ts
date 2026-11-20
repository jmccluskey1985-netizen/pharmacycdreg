import type { SupabaseClient } from '@supabase/supabase-js';
import { findPatientMatches } from '@/lib/patients';
import { isLate } from '@/lib/late-entry';
import type { ReconciledRow } from '@/lib/report-reconcile';

/**
 * For each report line missing from the register, the register line it would become: the
 * patient's record (or the name and address on the report), prescriber and script number; for
 * receipts, the supplier from Doctors & suppliers. Nothing is written here.
 */
/** "HEHIR, Paddy" / "Hehir* Paddy" → "Paddy Hehir"; other names tidied. */
export function reportName(n: string | null | undefined) {
  const t = (n ?? '').replace(/\*/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/^([^,]+),\s*(.+)$/);
  const name = m ? `${m[2]} ${m[1]}` : t;
  return name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s'’-])([a-z])/g, (_, a, b) => a + b.toUpperCase()) : name;
}

export async function draftLines(db: SupabaseClient, pharmacyId: string, out: ReconciledRow[]) {
  const { data: suppliers } = await db.from('contacts').select('name, address').eq('pharmacy_id', pharmacyId).eq('kind', 'supplier').eq('is_active', true).limit(200);
  return Promise.all(out.map(async (r, i) => {
      const base = { i, ...r, late: isLate(r.row.date) };
      if (r.status !== 'missing') return base;
      if (r.row.kind === 'receipt') {
        const s = (suppliers ?? []).find((c) => r.row.name && c.name.toLowerCase().split(/\s+/)[0] === r.row.name.toLowerCase().split(/\s+/)[0]);
        return { ...base, draft: { entry_type: 'receipt', transaction_date: r.row.date, quantity: r.row.quantity, supplier_name: s?.name ?? r.row.name ?? '', supplier_address: r.row.address ?? s?.address ?? '', notes: r.row.reference ? `Invoice ${r.row.reference}` : null } };
      }
      const m = r.row.name ? await findPatientMatches(db, pharmacyId, { full_name: reportName(r.row.name), address: r.row.address }).catch(() => null) : null;
      const p: any = m?.pick?.patient ?? null;
      return { ...base, patient: p ? { id: p.id, name: [p.first_name, p.surname].filter(Boolean).join(' '), address: p.address ?? null } : null, draft: {
        entry_type: 'supply', transaction_date: r.row.date, quantity: r.row.quantity,
        recipient_name: p ? [p.first_name, p.surname].filter(Boolean).join(' ') : reportName(r.row.name), recipient_address: r.row.address ?? p?.address ?? '', patient_id: p?.id ?? null,
        prescriber_name: r.row.prescriber, authority_to_possess: r.row.prescriber ? `Prescription: ${r.row.prescriber}` : 'Prescription', prescription_ref: r.row.reference,
      } };
    }));
}
