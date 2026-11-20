// Reports saved in any format → text the reader can use. Made-up people and numbers only.
import ExcelJS from 'exceljs';
import { extractReport } from '../../src/lib/report-text';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const text = async (name: string, data: Buffer | string, type = '') => {
  const x = await extractReport(name, type, Buffer.isBuffer(data) ? data : Buffer.from(data));
  return x && x.kind === 'text' ? x.text : x;
};

eq('CSV as is', await text('drug search.csv', 'Date Dispensed,Patient Name,Qty\n12/11/2026,Hehir* Paddy,14'), 'Date Dispensed,Patient Name,Qty\n12/11/2026,Hehir* Paddy,14');
eq('file with no extension that is text', await text('REPORT', '12/11/2026  Hehir* Paddy  OXYNORM 5MG HARD CAPS  14'), '12/11/2026  Hehir* Paddy  OXYNORM 5MG HARD CAPS  14');
eq('HTML table → one line per row, cells split', await text('report.htm', '<html><body><table><tr><th>Date Dispensed</th><th>Qty</th></tr><tr><td>12/11/2026</td><td>14</td></tr></table></body></html>'), 'Date Dispensed | Qty\n12/11/2026 | 14');
eq('RTF → text', await text('report.rtf', '{\\rtf1\\ansi 12/11/2026\\tab Hehir* Paddy\\tab 14\\par}'), '12/11/2026 | Hehir* Paddy | 14');
eq('UTF-16 text export', await text('report.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Qty 14', 'utf16le')])), 'Qty 14');

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Drug Search');
ws.addRow(['Date Dispensed', 'Patient Name', 'Script Dispensed As', 'Qty']);
ws.addRow(['12/11/2026', 'Hehir* Paddy', 'OXYNORM 5MG HARD CAPS', 14]);
const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
eq('Excel .xlsx (any name) → rows', await text('export.dat', xlsx), '--- Drug Search ---\nDate Dispensed | Patient Name | Script Dispensed As | Qty\n12/11/2026 | Hehir* Paddy | OXYNORM 5MG HARD CAPS | 14');

eq('PDF recognised by content, even without a type', await extractReport('report', '', Buffer.from('%PDF-1.7\n...')), { kind: 'doc', mediaType: 'application/pdf' });
eq('JPEG photo recognised', await extractReport('IMG_0001', '', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), { kind: 'doc', mediaType: 'image/jpeg' });
eq('old .xls: say how to save it', await extractReport('report.xls', '', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), { kind: 'unsupported', why: 'an older Excel or Office file (.xls)' });
eq('Crystal Reports .rpt: say how to save it', (await extractReport('cd.rpt', '', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0])) as any)?.why, 'a Crystal Reports file (.rpt)');
eq('random binary → null', await extractReport('x.bin', '', Buffer.from(Array.from({ length: 400 }, (_, i) => (i * 37) % 256))), null);

console.log(fail ? `\n${fail} failed` : '\nAll passed');
if (fail) process.exit(1);
