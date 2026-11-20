import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { ledgerSummary } from '@/lib/registers';
import { ScanError } from '@/lib/scan-extract';
import { reconcile, type ReportRow } from '@/lib/report-reconcile';
import { readReport } from '@/lib/report-read';
import { draftLines } from '@/lib/report-drafts';
import { matchProductText } from '@/lib/report-match';
import { liveRegisters } from '@/lib/match';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/**
 * A whole dispensing report (every CD on it, any number of pages or files) checked against every
 * book at once. Each line is put in its book by product (same rules as scanning: brand and
 * strength must match), then checked like a single-book stock check. Lines for products without a
 * book are listed so the pharmacist can open one. Nothing is written here.
 */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff('stockCheck');
    const limit = await checkRateLimit(`scan:${account.pharmacyId}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: 'Too many reads: wait a moment' }, { status: 429 });
    const form = await req.formData();
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    const db = createServiceClient();
    const read = await readReport(files, db);
    const all: ReportRow[] = [...read.rows, ...read.exactRows];
    if (!all.length) return NextResponse.json({ error: 'No controlled-drug lines were found on this report.', warnings: read.warnings }, { status: 422 });

    const regs = await liveRegisters(account.pharmacyId);
    const groups = new Map<string, ReportRow[]>();
    const unmatched: { product: string | null; date: string; quantity: number }[] = [];
    for (const r of all) {
      const m = matchProductText(regs, r.product);
      if (!m) { unmatched.push({ product: r.product, date: r.date, quantity: r.quantity }); continue; }
      if (!groups.has(m.id)) groups.set(m.id, []);
      groups.get(m.id)!.push(r);
    }
    const ids = [...groups.keys()];
    const summary = ids.length ? await ledgerSummary(ids) : {};
    const books = await Promise.all(ids.map(async (id) => {
      const rows = groups.get(id)!;
      const from = addDays(rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date), -3);
      const to = addDays(rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date), 3);
      const { data: ledger } = await db.from('cd_ledger')
        .select('id, seq, entry_type, transaction_date, quantity, recipient_name, supplier_name, prescription_ref, authority_to_possess, notes')
        .eq('register_id', id).in('entry_type', ['supply', 'receipt']).gte('transaction_date', from).lte('transaction_date', to).limit(5000);
      const out = reconcile(rows, (ledger ?? []) as any);
      const reg = regs.find((r) => r.id === id)!;
      return { register_id: id, label: reg.label, unit: reg.unit, balance: (summary as any)[id]?.balance ?? 0, lines: await draftLines(db, account.pharmacyId, out), skipped: 0, warnings: [] as string[] };
    }));
    books.sort((a, b) => b.lines.filter((l: any) => l.status !== 'in_register').length - a.lines.filter((l: any) => l.status !== 'in_register').length || a.label.localeCompare(b.label));
    const missing = books.reduce((n, b) => n + b.lines.filter((l: any) => l.status === 'missing').length, 0);
    await audit(account.pharmacyId, 'stock_check.report_reconcile_all', staff, account.authUserId, { files: files.length, exact_files: read.exactFiles, lines: all.length, books: books.length, missing, unmatched: unmatched.length });
    return NextResponse.json({ books, unmatched, skipped: read.skipped, warnings: read.warnings, period: read.period, exact: read.exactFiles > 0 });
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
