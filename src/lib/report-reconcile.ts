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
  /** The day was partly cut off on the photo (e.g. "?7/11/2026"): the dates it could be, latest first */
  date_options?: string[];
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
  for (const { row: given, i } of sorted) {
    // A date with its first digit cut off: use whichever possible date the register agrees with
    let row = given;
    if (given.date_options && given.date_options.length > 1) {
      const tryOne = (d: string) => matchOne({ ...given, date: d }, ledger, used);
      const best = given.date_options.map((d) => ({ d, r: tryOne(d) })).find((x) => x.r.status === 'in_register') ?? given.date_options.map((d) => ({ d, r: tryOne(d) })).find((x) => x.r.status === 'quantity_differs');
      if (best) row = { ...given, date: best.d, date_options: [best.d] };
    }
    const r = matchOne(row, ledger, used);
    if (r.lineId) used.add(r.lineId);
    out.push({ i, row, status: r.status, seq: r.seq, register_quantity: r.register_quantity, why: r.why });
  }
  return out.sort((a, b) => a.i - b.i).map(({ i: _i, ...r }) => r);
}

function matchOne(row: ReportRow, ledger: LedgerLine[], used: Set<string>): Omit<ReconciledRow, 'row'> & { lineId: string | null } {
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
    if (hit) return { lineId: hit.l.id, status: 'in_register', seq: hit.l.seq, register_quantity: Number(hit.l.quantity), why: hit.ref ? 'Reference matches' : hit.name ? 'Name, date and quantity match' : 'Date and quantity match' };
    const sameWho = scored.find((s) => (s.name || s.ref) && !s.qty);
    if (sameWho) return { lineId: sameWho.l.id, status: 'quantity_differs', seq: sameWho.l.seq, register_quantity: Number(sameWho.l.quantity), why: `Register line ${sameWho.l.seq} has ${Number(sameWho.l.quantity)}, the report has ${row.quantity}` };
    return { lineId: null, status: 'missing', seq: null, register_quantity: null, why: 'Not found in the register within 2 days of this date' };
}

/** Stock effect of adding the given rows (receipts in, supplies out). */
export const effectOf = (rows: Pick<ReportRow, 'kind' | 'quantity'>[]) => rows.reduce((n, r) => n + (r.kind === 'receipt' ? r.quantity : -r.quantity), 0);

/* ───────── Reading the report ───────── */
const strN = z.preprocess((v) => (v === '' ? null : v), z.string().nullable()).catch(null);
export const ReportSchema = z.object({
  period_from: strN, period_to: strN,
  rows: z.array(z.object({
    date: strN, date_text: strN, date_cut_off: z.boolean().nullable().catch(null), kind: z.enum(['supply', 'receipt', 'other']).catch('other'),
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
        required: ['date', 'date_text', 'date_cut_off', 'kind', 'name', 'address', 'prescriber', 'reference', 'quantity', 'product', 'for_this_register'],
        properties: {
          date: { ...sN, description: 'Transaction date as YYYY-MM-DD (Irish dates are day/month/year). null if any digit is missing or unreadable' },
          date_text: { ...sN, description: 'The date exactly as visible, with ? for each digit cut off or unreadable, e.g. "?7/11/2026" when the left edge of the page is cut off' },
          date_cut_off: { type: ['boolean', 'null'], description: 'true if part of the date is cut off, covered, in shadow or unreadable' },
          kind: { type: 'string', enum: ['supply', 'receipt', 'other'], description: 'supply = dispensed to a patient; receipt = received from a supplier/wholesaler; other = anything else (returns, adjustments, totals)' },
          name: { ...sN, description: 'Patient name (supply) or supplier name (receipt), as printed, without markers like *. Reports often print SURNAME first ("Kelly Mary"): keep the order printed' },
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
export const REPORT_SYSTEM = `You read controlled-drug reports exported or printed from an Irish community pharmacy's dispensing system (e.g. Touchstore, MPS, Helix, Socrates or Clanwilliam; a drug search report, CD dispensing report, drug history or transaction report, typically with columns like Date Dispensed, Patient Name, Script Dispensed As, Qty), so a pharmacist can check them against the Controlled Drugs Register. Transcribe every transaction line exactly: never invent or merge lines, never guess a name, date or quantity. Lines on a report are dispensings (supplies) unless they're clearly goods received.
Photos are often taken at an angle, with shadows, fingers or glare: follow each row across the page along its slant so date, name, product and quantity come from the SAME row (columns can look shifted up or down by half a row; use the row order: the first date goes with the first name, product and quantity). If the page edge cuts off part of a date (e.g. only "7/11/2026" is visible of "17/11/2026"), do NOT guess the missing digit: set date to null, date_text with "?" for the missing digit(s), and date_cut_off true. Ignore totals, page headers and the pharmacy's name. Return JSON only.`;
export const reportPrompt = (product: string, unit: string, text?: string) =>
  `The register being checked is: ${product}, counted in ${unit}. List every transaction line on the report and mark whether each is for this product.${text ? `\n\nThe report (exported text):\n${text}` : ''}`;

/**
 * The dates a partly cut-off date could be, latest first and never in the future:
 * "?7/11/2026" → 27/11, 17/11, 07/11 (those that exist and aren't after today).
 */
export function dateOptions(text: string | null | undefined, today: string): string[] {
  const m = (text ?? '').replace(/\s+/g, '').match(/([?\d]{0,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return [];
  const [, dayTxt, mon, yr] = m;
  const year = yr.length === 2 ? `20${yr}` : yr;
  const month = Number(mon);
  if (month < 1 || month > 12) return [];
  const known = dayTxt.replace(/\?/g, '');
  const days = new Date(Date.UTC(Number(year), month, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = days; d >= 1; d--) {
    const dd = String(d).padStart(2, '0');
    if (known && !dd.endsWith(known) && String(d) !== known) continue;
    if (!known && dayTxt.length === 0) continue;
    const iso = `${year}-${String(month).padStart(2, '0')}-${dd}`;
    if (iso <= today) out.push(iso);
  }
  return out;
}

/** Clean rows from the reader: only this product's supplies and receipts with a date (or possible dates) and quantity. */
export function usableRows(x: ReportExtraction, today = new Date().toISOString().slice(0, 10)): { rows: ReportRow[]; skipped: number } {
  const rows: ReportRow[] = [];
  let skipped = 0;
  for (const r of x.rows) {
    const opts = r.date_cut_off || !r.date ? dateOptions(r.date_text, today) : [];
    const date = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !r.date_cut_off ? r.date : opts[0] ?? null;
    if (r.for_this_register === false || r.kind === 'other' || !date || !r.quantity || r.quantity <= 0) { skipped++; continue; }
    rows.push({ date, kind: r.kind, name: r.name, address: r.address, prescriber: r.prescriber, reference: r.reference, quantity: r.quantity, product: r.product, ...(opts.length > 1 ? { date_options: opts } : {}) });
  }
  return { rows, skipped };
}
