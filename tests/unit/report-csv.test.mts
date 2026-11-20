// CSV exports of dispensing reports (e.g. MPS "Drug Search Report"). Made-up people only.
import { csvReportRows, parseCsv } from '../../src/lib/report-csv';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const row = (date: string, name: string | null, product: string | null, quantity: number, x: Record<string, string | null> = {}) => ({ date, kind: 'supply', name, address: null, prescriber: null, reference: null, quantity, product, ...x });

const MPS = `Sample Pharmacy,,,
DRUG SEARCH REPORT,,,
Date Dispensed,Patient Name,Script Dispensed As,Qty
05/11/2026,Grehan* Maura,OXYNORM 5MG HARD CAPS,28
12/11/2026,Hehir* Paddy,OXYNORM 5MG HARD CAPS,14
,,Total,42
`;
eq('MPS CSV: title lines skipped, rows read exactly, total ignored', csvReportRows(MPS), [
  row('2026-11-05', 'Grehan* Maura', 'OXYNORM 5MG HARD CAPS', 28),
  row('2026-11-12', 'Hehir* Paddy', 'OXYNORM 5MG HARD CAPS', 14),
]);
eq('quoted cells with commas', parseCsv('"Tobin, Eamon","1 Main St, Ennis",10')[0], ['Tobin, Eamon', '1 Main St, Ennis', '10']);
eq('semicolon export, 2-digit year, extra columns', csvReportRows('Date;Patient;Product;Quantity;Prescriber;Rx No.\n15/11/26;Eamon Tobin;MST CONTINUS 10MG;56;Dr A Brennan;R1044'), [
  row('2026-11-15', 'Eamon Tobin', 'MST CONTINUS 10MG', 56, { prescriber: 'Dr A Brennan', reference: 'R1044' }),
]);
eq('tab separated, ISO dates, no product column', csvReportRows('Date Dispensed\tPatient Name\tQty\n2026-11-14\tKinsella Bríd\t28'), [row('2026-11-14', 'Kinsella Bríd', null, 28)]);
eq('no date/quantity headings → null (sent to the reader instead)', csvReportRows('a,b,c\n1,2,3'), null);
eq('impossible date skipped', csvReportRows('Date,Qty\n31/13/2026,5\n01/12/2026,5').length, 1);

console.log(fail ? `\n${fail} failed` : '\nAll passed');
if (fail) process.exit(1);
