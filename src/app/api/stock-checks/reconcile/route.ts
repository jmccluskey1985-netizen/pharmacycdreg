import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy, currentBalance } from '@/lib/registers';
import { ScanError } from '@/lib/scan-extract';
import { reconcile } from '@/lib/report-reconcile';
import { readReport } from '@/lib/report-read';
import { draftLines } from '@/lib/report-drafts';
import { matchProductText } from '@/lib/report-match';
import { liveRegisters } from '@/lib/match';
import { productTitle } from '@/lib/product-name';
import { checkRateLimit } from '@/lib/rate-limit';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';
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
    const { account, staff } = await requireStaff('stockCheck');
    const limit = await checkRateLimit(`scan:${account.pharmacyId}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: 'Too many reads: wait a moment' }, { status: 429 });
    const form = await req.formData();
    const reg = await getRegisterForPharmacy(String(form.get('register_id') ?? ''), account.pharmacyId);
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    const unit = reg.product?.unit ?? 'units';
    const db = createServiceClient();
    const read = await readReport(files, db, { product: `${productTitle(reg.product)} (${reg.product?.drug_name ?? ''} ${reg.product?.strength ?? ''} ${reg.product?.form ?? ''})`, unit });
    // Exactly-read .QRP / CSV lines can list every product: keep this book's (a CSV with no product column is this book's)
    const regs = read.exactRows.length ? await liveRegisters(account.pharmacyId) : [];
    const mine = read.exactRows.filter((r) => !r.product || matchProductText(regs, r.product)?.id === reg.id);
    const rows = [...read.rows, ...mine];
    const skipped = read.skipped + read.exactRows.length - mine.length;
    const result = { warnings: read.warnings, period_from: read.period.from, period_to: read.period.to };
    if (!rows.length) return NextResponse.json({ error: `No ${productTitle(reg.product)} supplies or receipts were found on this report.`, warnings: result.warnings }, { status: 422 });

    const from = addDays(rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date), -3);
    const to = addDays(rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date), 3);
    const { data: ledger } = await db.from('cd_ledger')
      .select('id, seq, entry_type, transaction_date, quantity, recipient_name, supplier_name, prescription_ref, authority_to_possess, notes')
      .eq('register_id', reg.id).in('entry_type', ['supply', 'receipt']).gte('transaction_date', from).lte('transaction_date', to).limit(5000);
    const out = reconcile(rows, (ledger ?? []) as any);

    const lines = await draftLines(db, account.pharmacyId, out);
    await audit(account.pharmacyId, 'stock_check.report_reconcile', staff, account.authUserId, { register_id: reg.id, lines: rows.length, missing: out.filter((r) => r.status === 'missing').length, differs: out.filter((r) => r.status === 'quantity_differs').length });
    return NextResponse.json({ lines, skipped, period: { from: result.period_from, to: result.period_to }, balance: await currentBalance(reg.id), unit, warnings: result.warnings });
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
