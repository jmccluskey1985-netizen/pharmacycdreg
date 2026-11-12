/**
 * Photo of the LAST PAGE of a paper CD register → product + balance brought forward + date,
 * so a pharmacy can switch to CDReg mid-book.
 *
 * Same split as invoices: the reader transcribes dates and numbers only; the rules below
 * re-add the page (obtained − supplied) and decide the balance, flagging anything that
 * doesn't add up instead of guessing. Patient/prescriber names are deliberately NOT read.
 */
import { z } from 'zod';

const Row = z.object({
  date: z.string().nullable(),
  date_written: z.string().nullable(),
  obtained: z.number().nullable(),
  supplied: z.number().nullable(),
  balance: z.number().nullable(),
  balance_unclear: z.boolean(),
});
export const RegisterPageSchema = z.object({
  is_cd_register_page: z.boolean(),
  product_written: z.string().nullable(),
  drug_name: z.string().nullable(),
  brand: z.string().nullable(),
  strength: z.string().nullable(),
  form: z.string().nullable(),
  unit: z.enum(['tablets', 'capsules', 'ml', 'patches', 'ampoules', 'vials', 'units']).nullable(),
  likely_schedule: z.number().int().nullable(),
  balance_transferred: z.number().nullable(),
  rows: z.array(Row),
  warnings: z.array(z.string()),
});
export type RegisterPage = z.infer<typeof RegisterPageSchema>;

const ns = { type: ['string', 'null'] };
const nn = { type: ['number', 'null'] };
export const REGISTER_PAGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_cd_register_page', 'product_written', 'drug_name', 'brand', 'strength', 'form', 'unit', 'likely_schedule', 'balance_transferred', 'rows', 'warnings'],
  properties: {
    is_cd_register_page: { type: 'boolean', description: 'True if this is a page of a controlled drugs register' },
    product_written: { ...ns, description: 'The PRODUCT / CLASS OF DRUG heading exactly as written, e.g. "OXYCODONE OXYNORM 5mg"' },
    drug_name: { ...ns, description: 'Generic name, e.g. "Oxycodone hydrochloride"' },
    brand: { ...ns, description: 'Brand if written, e.g. "OxyNorm"' },
    strength: { ...ns, description: 'e.g. "5mg", "10mg/5ml"' },
    form: { ...ns, description: 'e.g. "capsule", "prolonged-release tablet", "oral solution". If only a brand is written use its usual form (OxyNorm 5mg = capsule).' },
    unit: { type: ['string', 'null'], enum: ['tablets', 'capsules', 'ml', 'patches', 'ampoules', 'vials', 'units', null] },
    likely_schedule: { type: ['integer', 'null'], description: 'Irish Misuse of Drugs Regulations schedule (2, 3 or 4)' },
    balance_transferred: { ...nn, description: 'The "balance transferred" / brought-forward figure at the top of the balance column, if written' },
    rows: {
      type: 'array',
      description: 'Every filled-in row, top to bottom. Skip blank rows.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'date_written', 'obtained', 'supplied', 'balance', 'balance_unclear'],
        properties: {
          date: { ...ns, description: 'YYYY-MM-DD. Irish dates are day/month/year. Resolve ditto marks (", 〃, u, ll) to the date above.' },
          date_written: { ...ns, description: 'The date as written' },
          obtained: { ...nn, description: 'AMOUNT OBTAINED column, else null' },
          supplied: { ...nn, description: 'AMOUNT SUPPLIED column, else null' },
          balance: { ...nn, description: 'STOCK BALANCE column as written, else null' },
          balance_unclear: { type: 'boolean', description: 'True if the balance digits are hard to read' },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

export const REGISTER_PAGE_SYSTEM = `You read a photo of a page from an Irish pharmacy's handwritten Controlled Drugs Register (PSI layout: DATE | NAME AND ADDRESS | AUTHORITY | AMOUNT OBTAINED | AMOUNT SUPPLIED | STOCK BALANCE). The pharmacy is moving to an electronic register and needs the product and the LAST stock balance and its date.

- The photo may be rotated 90° or 180° or taken at an angle. Read it in the correct orientation.
- The product is handwritten at the top (PRODUCT / CLASS OF DRUG lines), e.g. "OXYCODONE OXYNORM 5mg".
- Transcribe ONLY dates and the three amount columns for every filled row, in order, top to bottom. Do NOT transcribe names, addresses, prescribers or reference numbers — they are not needed.
- Handwritten digits are easy to confuse (1/7, 4/9, 5/6, 0/6, 3/8). Read each balance as written and set balance_unclear when unsure — do not "fix" it to make the sums work; the rules check the arithmetic.
- A row with an amount obtained is a receipt (balance goes up); supplied goes down.
- If the page is not a CD register page, set is_cd_register_page false.`;

export const registerPagePrompt = (n: number) =>
  `${n > 1 ? `These ${n} images are consecutive pages; the last image is the most recent page. ` : ''}Read the product, the balance transferred and every filled row.`;

export interface OpeningDecision {
  balance: number | null; // proposed balance brought forward
  date: string | null; // date of the last entry on the page
  source: 'written_and_sum_agree' | 'written_only' | 'sum_only' | 'needs_choice' | 'none';
  options: number[]; // when the book and the sum disagree, both are offered
  label: string;
  flags: string[];
  blocking: boolean; // pharmacist must choose/type the number
  rows_checked: number;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Re-add the page and decide the balance brought forward. */
export function decideOpening(page: RegisterPage): OpeningDecision {
  const flags: string[] = [];
  const rows = page.rows.filter((r) => r.obtained != null || r.supplied != null || r.balance != null);
  if (!page.is_cd_register_page) flags.push('This doesn’t look like a CD register page');
  if (!rows.length && page.balance_transferred == null) {
    return { balance: null, date: null, source: 'none', options: [], label: 'No entries read', flags: [...flags, 'No balance could be read — type it in'], blocking: true, rows_checked: 0 };
  }

  let running: number | null = page.balance_transferred;
  let lastExpected: number | null = null;
  let lastDate: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expected = running == null ? null : running + (r.obtained ?? 0) - (r.supplied ?? 0);
    if (r.date) lastDate = r.date;
    if (i === rows.length - 1) lastExpected = expected;
    else if (r.balance != null && expected != null && Math.abs(r.balance - expected) > 0.001) {
      flags.push(`Line ${i + 1}${r.date_written ? ` (${r.date_written})` : ''}: book says ${r.balance}, the sum gives ${expected} — check your paper book`);
    }
    // The paper book is the legal record: carry on from what it says where legible.
    running = r.balance != null && !r.balance_unclear ? r.balance : expected ?? r.balance;
  }

  const last = rows[rows.length - 1];
  const written = last ? last.balance : page.balance_transferred;
  const date = lastDate;
  if (!date) flags.push('No date read for the last entry — check the date');
  else if (date > today()) flags.push(`Date ${date} is in the future — check the date`);

  const base = { date, rows_checked: rows.length };
  if (written != null && lastExpected != null) {
    if (Math.abs(written - lastExpected) < 0.001) {
      if (last?.balance_unclear) flags.push('Last balance was hard to read, but the sum agrees');
      return { ...base, balance: written, source: 'written_and_sum_agree', options: [written], label: `${written} — book and sum agree`, flags, blocking: false };
    }
    return { ...base, balance: null, source: 'needs_choice', options: [written, lastExpected], label: `Book says ${written}${last?.balance_unclear ? ' (hard to read)' : ''}, the sum gives ${lastExpected}`, flags: [...flags, 'Last balance doesn’t add up — count the stock and choose the right figure'], blocking: true };
  }
  if (written != null) {
    return { ...base, balance: written, source: 'written_only', options: [written], label: `${written} — as written (couldn’t check the sum)`, flags: last?.balance_unclear ? [...flags, 'Last balance was hard to read — check it'] : flags, blocking: !!last?.balance_unclear };
  }
  if (lastExpected != null) {
    return { ...base, balance: lastExpected, source: 'sum_only', options: [lastExpected], label: `${lastExpected} — worked out from the page (no balance written)`, flags: [...flags, 'No balance written on the last line — check it'], blocking: true };
  }
  return { ...base, balance: null, source: 'none', options: [], label: 'No balance read', flags: [...flags, 'Type the balance in'], blocking: true };
}
