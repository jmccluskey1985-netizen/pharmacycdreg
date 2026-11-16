// Stock check vs dispensing report. Made-up patients, suppliers and numbers only.
import { reconcile, namesAgree, effectOf, usableRows } from '../../src/lib/report-reconcile';

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

console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
if (fail) process.exit(1);
