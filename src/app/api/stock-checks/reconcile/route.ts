import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy, currentBalance } from '@/lib/registers';
import { readDocument, parseJsonWith, ScanError } from '@/lib/scan-extract';
import { ReportSchema, REPORT_JSON_SCHEMA, REPORT_SYSTEM, reportPrompt, usableRows, reconcile } from '@/lib/report-reconcile';
import { findPatientMatches } from '@/lib/patients';
import { productTitle } from '@/lib/product-name';
import { isLate, irishToday } from '@/lib/late-entry';
import { getReaderConfig } from '@/lib/reader-config';
import { checkRateLimit } from '@/lib/rate-limit';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';
const DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 15 * 1024 * 1024;
const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/**
 * Stock check: a dispensing-system report (PDF, photo, or exported CSV / text) is read and checked
 * against this register. Returns each report line as in the register / missing / quantity differs,
 * with a ready-to-sign draft for each missing line. Nothing is written here: the pharmacist ticks
 * which to add, and each goes through the normal entry route (late-entry footnote, duplicate guard).
 * The report itself isn't kept.
 */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record);
    const limit = await checkRateLimit(`scan:${account.pharmacyId}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: 'Too many reads: wait a moment' }, { status: 429 });
    const form = await req.formData();
    const reg = await getRegisterForPharmacy(String(form.get('register_id') ?? ''), account.pharmacyId);
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Attach the report (PDF, photo or CSV)' }, { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: 'Up to 10 pages at a time' }, { status: 400 });
    if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return NextResponse.json({ error: 'The report is too large (max 15 MB)' }, { status: 400 });
    const isText = (f: File) => /^text\/|csv/.test(f.type) || /\.(csv|txt|tsv)$/i.test(f.name);
    if (files.some((f) => !isText(f) && !DOC_TYPES.includes(f.type))) return NextResponse.json({ error: 'Use a PDF, photo (JPG/PNG) or CSV export. For Excel, save as CSV first.' }, { status: 400 });
    const text = (await Promise.all(files.filter(isText).map((f) => f.text()))).join('\n').slice(0, 300_000);
    const docs = await Promise.all(files.filter((f) => !isText(f)).map(async (f) => ({ base64: Buffer.from(await f.arrayBuffer()).toString('base64'), mediaType: f.type })));

    const unit = reg.product?.unit ?? 'units';
    const db = createServiceClient();
    const { result } = await readDocument(docs, {
      reader: await getReaderConfig(db), system: REPORT_SYSTEM, schema: REPORT_JSON_SCHEMA, name: 'cd_report',
      prompt: reportPrompt(`${productTitle(reg.product)} (${reg.product?.drug_name ?? ''} ${reg.product?.strength ?? ''} ${reg.product?.form ?? ''})`, unit, text || undefined),
      parse: parseJsonWith(ReportSchema),
    });
    const { rows, skipped } = usableRows(result, irishToday());
    if (!rows.length) return NextResponse.json({ error: `No ${productTitle(reg.product)} supplies or receipts were found on this report.`, warnings: result.warnings }, { status: 422 });

    const from = addDays(rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date), -3);
    const to = addDays(rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date), 3);
    const { data: ledger } = await db.from('cd_ledger')
      .select('id, seq, entry_type, transaction_date, quantity, recipient_name, supplier_name, prescription_ref, authority_to_possess, notes')
      .eq('register_id', reg.id).in('entry_type', ['supply', 'receipt']).gte('transaction_date', from).lte('transaction_date', to).limit(5000);
    const out = reconcile(rows, (ledger ?? []) as any);

    // Fill what a register line needs for each missing one: the patient's record / the supplier's address
    const { data: suppliers } = await db.from('contacts').select('name, address').eq('pharmacy_id', account.pharmacyId).eq('kind', 'supplier').eq('is_active', true).limit(200);
    const lines = await Promise.all(out.map(async (r, i) => {
      const base = { i, ...r, late: isLate(r.row.date) };
      if (r.status !== 'missing') return base;
      if (r.row.kind === 'receipt') {
        const s = (suppliers ?? []).find((c) => r.row.name && c.name.toLowerCase().split(/\s+/)[0] === r.row.name.toLowerCase().split(/\s+/)[0]);
        return { ...base, draft: { entry_type: 'receipt', transaction_date: r.row.date, quantity: r.row.quantity, supplier_name: s?.name ?? r.row.name ?? '', supplier_address: r.row.address ?? s?.address ?? '', notes: r.row.reference ? `Invoice ${r.row.reference}` : null } };
      }
      const m = r.row.name ? await findPatientMatches(db, account.pharmacyId, { full_name: r.row.name, address: r.row.address }).catch(() => null) : null;
      const p: any = m?.pick?.patient ?? null;
      return { ...base, patient: p ? { id: p.id, name: [p.first_name, p.surname].filter(Boolean).join(' '), address: p.address ?? null } : null, draft: {
        entry_type: 'supply', transaction_date: r.row.date, quantity: r.row.quantity,
        recipient_name: p ? [p.first_name, p.surname].filter(Boolean).join(' ') : (r.row.name ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim(), recipient_address: r.row.address ?? p?.address ?? '', patient_id: p?.id ?? null,
        prescriber_name: r.row.prescriber, authority_to_possess: r.row.prescriber ? `Prescription: ${r.row.prescriber}` : 'Prescription', prescription_ref: r.row.reference,
      } };
    }));
    await audit(account.pharmacyId, 'stock_check.report_reconcile', staff, account.authUserId, { register_id: reg.id, lines: rows.length, missing: out.filter((r) => r.status === 'missing').length, differs: out.filter((r) => r.status === 'quantity_differs').length });
    return NextResponse.json({ lines, skipped, period: { from: result.period_from, to: result.period_to }, balance: await currentBalance(reg.id), unit, warnings: result.warnings });
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
