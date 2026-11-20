import type { SupabaseClient } from '@supabase/supabase-js';
import { readDocument, parseJsonWith } from '@/lib/scan-extract';
import { ReportSchema, REPORT_JSON_SCHEMA, REPORT_SYSTEM, reportPrompt, usableRows, type ReportRow } from '@/lib/report-reconcile';
import { getReaderConfig } from '@/lib/reader-config';
import { irishToday } from '@/lib/late-entry';
import { isQrp, qrpPages, qrpToText, touchstoreRows } from '@/lib/qrp';
import { HttpError } from '@/lib/access';
import { extractReport } from '@/lib/report-text';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Read a dispensing-system report from any mix of up to 10 files, whatever it was saved as:
 * photos of each page, PDF, Excel, CSV / text, HTML, RTF, or a QuickReport .QRP file (e.g. Touchstore). A Touchstore .QRP is read
 * exactly from its own text: nothing is sent to the AI reader. Everything else goes to the EU
 * reader as usual. Returns the reader's lines (`rows`; with one book given, only that book's) and
 * the exactly-read .QRP lines (`exactRows`, every product: match them to books with matchProductText).
 *
 * `register`: check one book (the reader marks which lines are for it); omitted: every line.
 */
export async function readReport(files: File[], db: SupabaseClient, register?: { product: string; unit: string }) {
  if (!files.length) throw new HttpError(400, 'Attach the report: photos of each page, a PDF, a CSV export or a .QRP file');
  if (files.length > 10) throw new HttpError(400, 'Up to 10 pages or files at a time');
  if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) throw new HttpError(400, 'The report is too large (max 15 MB)');

  const rows: ReportRow[] = [];
  const exactRows: ReportRow[] = [];
  const texts: string[] = [];
  const docs: { base64: string; mediaType: string }[] = [];
  let exact = 0;
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    if (isQrp(f.name, buf)) {
      const pages = qrpPages(buf);
      const ts = pages.length ? touchstoreRows(pages) : null;
      if (ts) {
        exact++;
        for (const r of ts) exactRows.push({ date: r.date, kind: 'supply', name: r.name, address: r.address, prescriber: r.prescriber, reference: r.reference, quantity: r.quantity, product: r.product });
        continue;
      }
      const t = qrpToText(buf);
      if (!t) throw new HttpError(400, `Couldn’t open ${f.name}. In your dispensing system, print the report to PDF instead and upload that.`);
      texts.push(t);
    } else {
      const x = await extractReport(f.name, f.type, buf);
      if (!x) throw new HttpError(400, `Couldn’t read ${f.name || 'that file'}. Upload it as a PDF, photo, Excel, CSV or text file, or print the report to PDF from your dispensing system.`);
      if (x.kind === 'unsupported') throw new HttpError(400, `${f.name} is ${x.why}, which can’t be read directly. Open it and save it as PDF, .xlsx or CSV, or print the report to PDF from your dispensing system.`);
      if (x.kind === 'doc') docs.push({ base64: buf.toString('base64'), mediaType: x.mediaType });
      else if (x.text.trim()) texts.push(`--- ${f.name || 'report'} ---\n${x.text}`);
    }
  }

  let warnings: string[] = [];
  let skipped = 0;
  let period: { from: string | null; to: string | null } = { from: null, to: null };
  if (docs.length || texts.length) {
    const text = texts.join('\n\n').slice(0, 300_000);
    const { result } = await readDocument(docs, {
      reader: await getReaderConfig(db), system: REPORT_SYSTEM, schema: REPORT_JSON_SCHEMA, name: 'cd_report',
      prompt: register
        ? reportPrompt(register.product, register.unit, text || undefined)
        : `List every controlled-drug transaction line on the report (every product), each with its product exactly as printed. Set for_this_register to null.${text ? `\n\nThe report (exported text):\n${text}` : ''}`,
      parse: parseJsonWith(ReportSchema),
    });
    const u = usableRows(result, irishToday());
    rows.push(...u.rows);
    skipped = u.skipped;
    warnings = result.warnings ?? [];
    period = { from: result.period_from ?? null, to: result.period_to ?? null };
  }
  return { rows, exactRows, skipped, warnings, period, exactFiles: exact };
}
