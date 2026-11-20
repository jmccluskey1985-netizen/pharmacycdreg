// .QRP (QuickReport) reports, e.g. Touchstore's "Controlled Drug Report", and matching report
// product names to CD books. The QRP here is built in the test; every person and number is made up.
import { qrpPages, qrpToText, touchstoreRows, isQrp } from '../../src/lib/qrp';
import { parseProductText, matchProductText } from '../../src/lib/report-match';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// A minimal QuickReport-like file: some header bytes, then one EMF page of text records.
function text(x: number, y: number, s: string) {
  const n = s.length, size = 76 + Math.ceil((n * 2) / 4) * 4;
  const b = Buffer.alloc(size);
  b.writeUInt32LE(84, 0); b.writeUInt32LE(size, 4);
  b.writeInt32LE(x, 36); b.writeInt32LE(y, 40); b.writeUInt32LE(n, 44); b.writeUInt32LE(76, 48);
  b.write(s, 76, 'utf16le');
  return b;
}
function page(cells: [number, number, string][]) {
  const recs = cells.map(([x, y, s]) => text(x, y, s));
  const eof = Buffer.alloc(20); eof.writeUInt32LE(14, 0); eof.writeUInt32LE(20, 4);
  const head = Buffer.alloc(108); head.writeUInt32LE(1, 0); head.writeUInt32LE(108, 4); head.write(' EMF', 40, 'latin1');
  const body = Buffer.concat([head, ...recs, eof]);
  body.writeUInt32LE(body.length, 48); body.writeUInt32LE(recs.length + 2, 52);
  return body;
}
const HEAD: [number, number, string][] = [
  [561, 52, 'Controlled Drug Report'], [53, 69, 'Schemes'], [1200, 69, 'Sample Pharmacy (1)'],
  [50, 90, "Disp'd"], [183, 90, 'Patient Name'], [448, 90, 'Patient ID'], [476, 90, 'Address'], [853, 90, 'Scheme'], [982, 90, 'No.'], [1010, 90, 'Dispenser'],
  [50, 104, 'Prescription Date/Time'],
  [50, 118, 'Product Name'], [220, 118, 'Pack Size'], [286, 118, 'GMS No.'], [445, 118, 'IPU Code'], [452, 118, 'Dosage'], [776, 118, 'Qty. Disp'], [834, 118, "Qty. Ow'd"], [897, 118, 'Price'], [910, 118, 'Prescriber Name'],
  [50, 134, 'Repeats Made'], [136, 134, 'Total Repeats'], [242, 134, 'Notes:'], [910, 134, 'Prescriber Address'],
];
const rec = (y: number, when: string, rx: string, name: string, addr: string, no: string, product: string, qty: string, owed: string, dr: string): [number, number, string][] => [
  [50, y, when], [114, y, rx], [183, y + 1, name], [449, y + 1, '30418'], [476, y + 1, addr], [853, y + 1, no.slice(0, 2)], [982, y + 1, no], [1010, y + 1, 'Aoife'],
  [50, y + 12, product], [273, y + 12, '56CAPS'], [336, y + 12, '61204'], [452, y + 12, 'ONE TWICE DAILY'], [777, y + 12, qty], [833, y + 12, owed], [897, y + 12, '9.80'], [910, y + 12, dr],
];
const file = Buffer.concat([Buffer.from([3, 0, 0x33, 1, 0xfe, 0xff, 0xff, 0xff]), Buffer.alloc(128), page([
  ...HEAD,
  ...rec(190, '12/11/2026 09:41', '12/11/2026', 'HEHIR, Paddy', '3 Mill Lane, Ennis', 'GM2611/0041', 'OXYNORM 5MG HARD CAPS', '14', '0', 'Brennan, Dr Aoife'),
  ...rec(228, '13/11/2026 10:02', '10/11/2026', 'FARRELL, Declan', '12 Abbey Court, Ennis', 'ME2611/0044', 'METHADONE HCL SF 1MG/ML ORAL SOLN', '420', '210', 'Nolan, Dr Ciaran'),
  ...rec(266, '14/11/2026 15:20', '14/11/2026', 'LYNCH, Gerard', '8 Weir Road, Clarecastle', 'DP2611/0102', 'MST CONTINUS 10MG PRO REL TABS', '56', '0', 'Brennan, Dr Aoife'),
  ...rec(304, '15/11/2026 11:12', '15/11/2026', 'CORCORAN, Niamh', '27 Station Road, Ennis', 'EM2611/0118', 'PALEXIA 50MG FC TABS', '28', '0', 'Ennis General'),
])]);

eq('recognised as QRP by content', isQrp('report.bin', file), true);
eq('one page found', qrpPages(file).length, 1);
const t = qrpToText(file)!;
eq('text keeps the column headings on one line', t.split('\n').includes("Disp'd | Patient Name | Patient ID | Address | Scheme | No. | Dispenser"), true);
eq('a record line keeps its cells left to right', t.includes('12/11/2026 09:41 | 12/11/2026 | HEHIR, Paddy | 30418 | 3 Mill Lane, Ennis | GM | GM2611/0041 | Aoife'), true);
const rows = touchstoreRows(qrpPages(file))!;
eq('4 dispensings read', rows.length, 4);
eq('first: dispensed date (not prescription date), Qty. Disp, script No.', [rows[1].date, rows[1].quantity, rows[1].owed, rows[1].reference], ['2026-11-13', 420, 210, 'ME2611/0044']);
eq('patient, address and prescriber', [rows[0].name, rows[0].address, rows[0].prescriber], ['HEHIR, Paddy', '3 Mill Lane, Ennis', 'Brennan, Dr Aoife']);
eq('not a Touchstore layout → null (read as text instead)', touchstoreRows([[{ x: 1, y: 1, s: 'Hello' }]]), null);
eq('not a QRP', [qrpToText(Buffer.from('just text')), isQrp('x.pdf', Buffer.from('%PDF-1.7'))], [null, false]);

// Product text → CD book
eq('parse OXYNORM 5MG HARD CAPS', parseProductText('OXYNORM 5MG HARD CAPS'), { name: 'OXYNORM', strength: '5mg', form: 'HARD CAPS' });
eq('parse methadone mg/ml, salt and SF dropped', parseProductText('METHADONE HCL SF 1MG/ML ORAL SOLN'), { name: 'METHADONE', strength: '1mg/ml', form: 'ORAL SOLN' });
const R = (id: string, drug_name: string, strength: string, form: string, brand: string | null, class_name = drug_name) => ({ id, label: id, drug_name, strength, form, unit: 'x', class_name, brand });
const regs = [
  R('oxy5', 'Oxycodone hydrochloride', '5mg', 'capsule', 'OxyNorm', 'Oxycodone'),
  R('oxy10', 'Oxycodone hydrochloride', '10mg', 'capsule', 'OxyNorm', 'Oxycodone'),
  R('mst10', 'Morphine sulfate', '10mg', 'prolonged-release tablet', 'MST Continus', 'Morphine'),
  R('meth', 'Methadone hydrochloride', '1mg/ml', 'oral solution', 'Methadone Rowex', 'Methadone'),
  R('shortec5', 'Oxycodone hydrochloride', '5mg', 'capsule', 'Shortec', 'Oxycodone'),
];
eq('OxyNorm 5mg → its own book, not Shortec', matchProductText(regs, 'OXYNORM 5MG HARD CAPS')?.id, 'oxy5');
eq('MST Continus 10mg → MST book', matchProductText(regs, 'MST CONTINUS 10MG PRO REL TABS')?.id, 'mst10');
eq('generic methadone 1mg/ml → the methadone book', matchProductText(regs, 'METHADONE HCL SF 1MG/ML ORAL SOLN')?.id, 'meth');
eq('a product with no book → null', matchProductText(regs, 'PALEXIA 50MG FC TABS'), null);
eq('wrong strength → null', matchProductText(regs, 'OXYNORM 20MG HARD CAPS'), null);

console.log(fail ? `\n${fail} failed` : '\nAll passed');
if (fail) process.exit(1);
