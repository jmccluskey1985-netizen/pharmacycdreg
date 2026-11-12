import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);
const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * Patient report: every controlled drug supplied to (or returned by) one patient, across
 * all registers. Uses the effective (corrected) values. Each run is recorded in the audit trail.
 */
export async function GET(req: Request) {
  try {
    const { account, staff } = await requireStaff();
    const url = new URL(req.url);
    let name = (url.searchParams.get('name') || '').trim();
    let address = (url.searchParams.get('address') || '').trim();
    const patientId = url.searchParams.get('patient_id');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const db = createServiceClient();
    // A patient record: lines linked to it, plus older lines with the same name (before linking existed).
    let linkedIds: string[] = [];
    if (patientId) {
      const { data: pt } = await db.from('patients').select('first_name, surname').eq('id', patientId).eq('pharmacy_id', account.pharmacyId).maybeSingle();
      if (!pt) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      name = `${pt.first_name} ${pt.surname}`.trim();
      address = '';
      const { data: linked } = await db.from('cd_entries').select('id').eq('patient_id', patientId).limit(2000);
      linkedIds = (linked ?? []).map((x) => x.id);
    }
    if (name.length < 2) return NextResponse.json({ error: 'Choose a patient' }, { status: 400 });
    const { data: regs } = await db.from('cd_registers').select('id, product:cd_products(drug_name, strength, form, unit)').eq('pharmacy_id', account.pharmacyId);
    const regMap = new Map((regs ?? []).map((r: any) => [r.id, r.product]));
    if (!regMap.size) return NextResponse.json({ rows: [], totals: [] });

    let q = db.from('cd_ledger').select('*').in('register_id', Array.from(regMap.keys())).in('entry_type', ['supply', 'patient_return', 'patient_return_destruction']).or(linkedIds.length ? `recipient_name.ilike.${esc(name).replace(/[,()]/g, ' ')},id.in.(${linkedIds.join(',')})` : `recipient_name.ilike.${esc(name).replace(/[,()]/g, ' ')}`).order('transaction_date', { ascending: true }).order('seq', { ascending: true }).limit(2000);
    if (address) q = q.ilike('recipient_address', esc(address));
    if (from) q = q.gte('transaction_date', from);
    if (to) q = q.lte('transaction_date', to);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []).map((r: any) => ({ ...r, product: regMap.get(r.register_id) }));

    const totals: Record<string, { label: string; unit: string; supplied: number; returned: number; count: number }> = {};
    for (const r of rows) {
      const k = r.register_id;
      const t = (totals[k] ||= { label: `${r.product.drug_name} ${r.product.strength} ${r.product.form}`, unit: r.product.unit, supplied: 0, returned: 0, count: 0 });
      if (r.entry_type === 'supply') { t.supplied += Number(r.quantity); t.count++; } else if (r.entry_type === 'patient_return') t.returned += Number(r.quantity);
    }
    await audit(account.pharmacyId, 'report.patient', staff, account.authUserId, { rows: rows.length, from, to });

    if (url.searchParams.get('format') === 'csv') {
      const head = ['Date', 'Drug', 'Strength', 'Form', 'Type', 'Quantity', 'Unit', 'Patient', 'Address', 'Prescriber', 'Authority', 'Rx ref', 'Collected by'];
      const lines = rows.map((r: any) => [r.transaction_date, r.product.drug_name, r.product.strength, r.product.form, r.entry_type === 'supply' ? 'Supplied' : 'Patient return', Number(r.quantity), r.product.unit, r.recipient_name, r.recipient_address, r.prescriber_name, r.authority_to_possess, r.prescription_ref, r.collected_by].map(csvCell).join(','));
      return new NextResponse([head.join(','), ...lines].join('\n'), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="patient-report-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.json({ rows, totals: Object.values(totals) });
  } catch (err) {
    return errorResponse(err);
  }
}
