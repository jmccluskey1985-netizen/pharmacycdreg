// Stock check vs dispensing report. Made-up patients, suppliers and numbers only.
import { reconcile, namesAgree, effectOf, usableRows, dateOptions } from '../../src/lib/report-reconcile';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const L = (seq: number, entry_type: string, date: string, quantity: number, x: Record<string, string> = {}) => ({ id: `e${seq}`, seq, entry_type, transaction_date: date, quantity, ...x });
const R = (date: string, kind: 'supply' | 'receipt', name: string | null, quantity: number, reference: string | null = null) => ({ date, kind, name, address: null, prescriber: null, reference, quantity, product: null });

const ledger = [
  L(1, 'receipt', '2026-11-02', 112, { supplier_name: 'United Drug', notes: 'Invoice 4471902' }),
  L(2, 'supply', '2026-11-05', 28, { recipient_name: 'Mary Kelly', prescription_ref: 'Rx 10301' }),
  L(3, 'supply', '2026-11-06', 56, { recipient_name: 'John Murphy' }),
  L(4, 'supply', '2026-11-09', 14, { recipient_name: 'Patrick Hayes' }),
];

eq('names: surname-first and a typo still agree', [namesAgree('KELLY, MARY', 'Mary Kelly'), namesAgree('Patrick Hayse', 'Patrick Hayes'), namesAgree('Mary Kelly', 'John Murphy')], [true, true, false]);
eq('names: titles and wholesaler words are ignored', [namesAgree('Mrs Mary Kelly', 'Kelly'), namesAgree('United Drug Wholesale Ltd', 'United Drug')], [true, true]);

const out = reconcile([
  R('2026-11-02', 'receipt', 'UNITED DRUG', 112),
  R('2026-11-05', 'supply', 'KELLY, MARY', 28, '10301'),
  R('2026-11-07', 'supply', 'John Murphy', 56),        // a day off: still the same supply
  R('2026-11-09', 'supply', 'Patrick Hayes', 28),      // register has 14
  R('2026-11-10', 'supply', 'Niamh Corcoran', 14),     // not in the register
  R('2026-11-05', 'supply', 'Mary Kelly', 28),         // a second supply the same day: register has only one
], ledger);
eq('statuses', out.map((r) => r.status), ['in_register', 'in_register', 'in_register', 'quantity_differs', 'missing', 'missing']);
eq('matched register lines', out.map((r) => r.seq), [1, 2, 3, 4, null, null]);
eq('quantity difference explains itself', out[3].why, 'Register line 4 has 14, the report has 28');

eq('a line already used isn’t matched twice', reconcile([R('2026-11-05', 'supply', 'Mary Kelly', 28), R('2026-11-05', 'supply', 'Mary Kelly', 28)], ledger).map((r) => r.status), ['in_register', 'missing']);
eq('more than 2 days away is not the same supply', reconcile([R('2026-11-09', 'supply', 'Mary Kelly', 28)], ledger)[0].status, 'missing');
eq('a supply never matches a receipt', reconcile([R('2026-11-02', 'supply', 'United Drug', 112)], ledger)[0].status, 'missing');
eq('no name on the report: the only same-day line of that quantity', reconcile([R('2026-11-06', 'supply', null, 56)], ledger)[0].status, 'in_register');

eq('effect: receipts add, supplies take away', effectOf([{ kind: 'receipt', quantity: 100 }, { kind: 'supply', quantity: 28 }]), 72);
eq('usable rows: other products, totals and undated lines are skipped', usableRows({ period_from: null, period_to: null, warnings: [], rows: [
  { date: '2026-11-05', kind: 'supply', name: 'A B', address: null, prescriber: null, reference: null, quantity: 28, product: null, for_this_register: true },
  { date: '2026-11-05', kind: 'supply', name: 'A B', address: null, prescriber: null, reference: null, quantity: 28, product: null, for_this_register: false },
  { date: null, kind: 'supply', name: 'A B', address: null, prescriber: null, reference: null, quantity: 28, product: null, for_this_register: null },
  { date: '2026-11-05', kind: 'other', name: 'Total', address: null, prescriber: null, reference: null, quantity: 56, product: null, for_this_register: null },
] }).skipped, 3);

// Photos with the left edge cut off: "?7/11/2026" could be the 7th, 17th or 27th
eq('cut-off day: possible dates, latest first, none in the future', dateOptions('?7/11/2026', '2026-11-20'), ['2026-11-17', '2026-11-07']);
eq('cut-off day before today’s month: all three', dateOptions('?7/10/2026', '2026-11-20'), ['2026-10-27', '2026-10-17', '2026-10-07']);
eq('cut-off day: a 30-day month has no 31st', dateOptions('?1/11/2026', '2026-12-31'), ['2026-11-21', '2026-11-11', '2026-11-01']);
eq('whole date visible: just that date', dateOptions('04/11/2026', '2026-11-20'), ['2026-11-04']);
const cut = usableRows({ period_from: null, period_to: null, warnings: [], rows: [
  { date: null, date_text: '?4/11/2026', date_cut_off: true, kind: 'supply', name: 'Hehir* Paddy', address: null, prescriber: null, reference: null, quantity: 12, product: 'OXYNORM 5MG HARD CAPS', for_this_register: true },
] }, '2026-11-20');
eq('cut-off row is kept with its possible dates', cut.rows[0].date_options, ['2026-11-14', '2026-11-04']);
const L2 = [L(9, 'supply', '2026-11-04', 12, { recipient_name: 'Paddy Hehir' })];
const r2 = reconcile(cut.rows, L2);
eq('cut-off date: the register decides which day it was', [r2[0].status, r2[0].row.date, r2[0].seq], ['in_register', '2026-11-04', 9]);
eq('surname-first name with a * marker still matches', namesAgree('Hehir* Paddy', 'Paddy Hehir'), true);
eq('cut-off date not in the register: missing, still offers the dates', reconcile(cut.rows, [])[0].row.date_options, ['2026-11-14', '2026-11-04']);

console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
if (fail) process.exit(1);
