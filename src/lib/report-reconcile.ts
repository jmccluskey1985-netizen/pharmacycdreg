import { z } from 'zod';
import { normName, editDistance } from './patient-match';
import { refTokens } from './duplicates';

/**
 * Stock check against a dispensing-system report: which transactions on the report aren't in the
 * register? Pure matching (unit-tested) plus the reading schema for the report itself.
 *
 * A report line is "in the register" when a register line of the same kind (supply / receipt) is
 * within 2 days of it, for the same quantity, and the name or reference agrees (or it's the only
 * line of that quantity that day). Same person and date but a different quantity is shown as a
 * quantity difference to investigate, never added. Nothing is ever changed automatically.
 */
export type ReportKind = 'supply' | 'receipt';
export interface ReportRow {
  date: string; kind: ReportKind; name: string | null; address: string | null; prescriber: string | null;
  reference: string | null; quantity: number; product: string | null;
}
export interface LedgerLine {
  id: string; seq: number; entry_type: string; transaction_date: string; quantity: number | string;
  recipient_name?: string | null; supplier_name?: string | null; prescription_ref?: string | null; authority_to_possess?: string | null; notes?: string | null;
}
export type RowStatus = 'in_register' | 'missing' | 'quantity_differs';
export interface ReconciledRow { row: ReportRow; status: RowStatus; seq: number | null; register_quantity: number | null; why: string }

const DAY = 864e5;
const dayDiff = (a: string, b: string) => Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const NOISE = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'the', 'and', 'ltd', 'limited', 'wholesale', 'pharma', 'healthcare', 'ireland', 'plc', 'mc', 'mac', 'o']);
const tokens = (s: string | null | undefined) => normName(s).split(' ').filter((t) => t.length >= 3 && !NOISE.has(t));

/** Do two names share a word (allowing one typo in words of 5+ letters)? "Mary Kelly" ~ "KELLY, MARY" ~ "M Kely" */
export function namesAgree(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  return ta.some((x) => tb.some((y) => x === y || (x.length >= 5 && y.length >= 5 && editDistance(x, y) <= 1)));
}
function refsAgree(row: ReportRow, l: LedgerLine) {
  const r = refTokens(row.reference);
  if (!r.length) return false;
  const mine = new Set([...refTokens(l.prescription_ref), ...refTokens(l.authority_to_possess), ...refTokens(l.notes)]);
  return r.some((t) => mine.has(t));
}

export function reconcile(rows: ReportRow[], ledger: LedgerLine[]): ReconciledRow[] {
  const used = new Set<string>();
  const sorted = rows.map((row, i) => ({ row, i })).sort((a, b) => a.row.date.localeCompare(b.row.date));
  const out: (ReconciledRow & { i: number })[] = [];
  for (const { row, i } of sorted) {
    const near = ledger.filter((l) => !used.has(l.id) && l.entry_type === row.kind && dayDiff(l.transaction_date, row.date) <= 2);
    const scored = near.map((l) => {
      const name = namesAgree(row.name, row.kind === 'supply' ? l.recipient_name : l.supplier_name);
      const ref = refsAgree(row, l);
      const qty = Number(l.quantity) === row.quantity;
      const sameDay = l.transaction_date === row.date;
      return { l, name, ref, qty, sameDay, score: (ref ? 4 : 0) + (name ? 3 : 0) + (qty ? 2 : 0) + (sameDay ? 1 : 0) - dayDiff(l.transaction_date, row.date) * 0.1 };
    }).sort((a, b) => b.score - a.score);
    const exact = scored.find((s) => s.qty && (s.name || s.ref));
    const sameQtySameDay = scored.filter((s) => s.qty && s.sameDay);
    const loneQty = !row.name && !row.reference && sameQtySameDay.length === 1 ? sameQtySameDay[0] : null;
    const hit = exact ?? loneQty;
    if (hit) {
      used.add(hit.l.id);
      out.push({ i, row, status: 'in_register', seq: hit.l.seq, register_quantity: Number(hit.l.quantity), why: hit.ref ? 'Reference matches' : hit.name ? 'Name, date and quantity match' : 'Date and quantity match' });
      continue;
    }
    const sameWho = scored.find((s) => (s.name || s.ref) && !s.qty);
    if (sameWho) {
      used.add(sameWho.l.id);
      out.push({ i, row, status: 'quantity_differs', seq: sameWho.l.seq, register_quantity: Number(sameWho.l.quantity), why: `Register line ${sameWho.l.seq} has ${Number(sameWho.l.quantity)}, the report has ${row.quantity}` });
      continue;
    }
    out.push({ i, row, status: 'missing', seq: null, register_quantity: null, why: 'Not found in the register within 2 days of this date' });
  }
  return out.sort((a, b) => a.i - b.i).map(({ i: _i, ...r }) => r);
}

/** Stock effect of adding the given rows (receipts in, supplies out). */
export const effectOf = (rows: Pick<ReportRow, 'kind' | 'quantity'>[]) => rows.reduce((n, r) => n + (r.kind === 'receipt' ? r.quantity : -r.quantity), 0);

/* ───────── Reading the report ───────── */
const strN = z.preprocess((v) => (v === '' ? null : v), z.string().nullable()).catch(null);
export const ReportSchema = z.object({
  period_from: strN, period_to: strN,
  rows: z.array(z.object({
    date: strN, kind: z.enum(['supply', 'receipt', 'other']).catch('other'),
    name: strN, address: strN, prescriber: strN, reference: strN,
    quantity: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().nullable()).catch(null),
    product: strN, for_this_register: z.boolean().nullable().catch(null),
  })).catch([]),
  warnings: z.array(z.string()).catch([]),
});
export type ReportExtraction = z.infer<typeof ReportSchema>;

const sN = { type: ['string', 'null'] };
export const REPORT_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['period_from', 'period_to', 'rows', 'warnings'],
  properties: {
    period_from: { ...sN, description: 'Report start date YYYY-MM-DD if shown' },
    period_to: { ...sN, description: 'Report end date YYYY-MM-DD if shown' },
    rows: {
      type: 'array', description: 'Every transaction line on the report, in order. One item per line.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['date', 'kind', 'name', 'address', 'prescriber', 'reference', 'quantity', 'product', 'for_this_register'],
        properties: {
          date: { ...sN, description: 'Transaction date as YYYY-MM-DD (Irish dates are day/month/year)' },
          kind: { type: 'string', enum: ['supply', 'receipt', 'other'], description: 'supply = dispensed to a patient; receipt = received from a supplier/wholesaler; other = anything else (returns, adjustments, totals)' },
          name: { ...sN, description: 'Patient name (supply) or supplier name (receipt), as printed' },
          address: { ...sN, description: 'Patient or supplier address if printed' },
          prescriber: { ...sN, description: 'Prescriber / doctor if printed' },
          reference: { ...sN, description: 'Prescription / script / invoice number if printed' },
          quantity: { type: ['number', 'null'], description: 'Quantity in the register’s unit (tablets, capsules, ml, patches…). If packs are given with a pack size, multiply out.' },
          product: { ...sN, description: 'The product on this line as printed' },
          for_this_register: { type: ['boolean', 'null'], description: 'true if the line is for the product named in the prompt (same drug, strength and form), false if it is a different product, null if unsure' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};
export const REPORT_SYSTEM = `You read controlled-drug reports exported or printed from an Irish community pharmacy's dispensing system (e.g. a CD dispensing report, drug history or transaction report), so a pharmacist can check them against the Controlled Drugs Register. Transcribe every transaction line exactly: never invent or merge lines, never guess a name, date or quantity. Ignore totals and page headers. Return JSON only.`;
export const reportPrompt = (product: string, unit: string, text?: string) =>
  `The register being checked is: ${product}, counted in ${unit}. List every transaction line on the report and mark whether each is for this product.${text ? `\n\nThe report (exported text):\n${text}` : ''}`;

/** Clean rows from the reader: only this product's supplies and receipts with a date and quantity. */
export function usableRows(x: ReportExtraction): { rows: ReportRow[]; skipped: number } {
  const rows: ReportRow[] = [];
  let skipped = 0;
  for (const r of x.rows) {
    if (r.for_this_register === false || r.kind === 'other' || !r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.quantity || r.quantity <= 0) { skipped++; continue; }
    rows.push({ date: r.date, kind: r.kind, name: r.name, address: r.address, prescriber: r.prescriber, reference: r.reference, quantity: r.quantity, product: r.product });
  }
  return { rows, skipped };
}
