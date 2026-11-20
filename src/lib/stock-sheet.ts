/**
 * CD stock count sheet: every open CD book with its register balance, and blank columns to
 * write the physical count, the difference and initials. Printable, and as a styled Excel file
 * (built in the browser; no patient data, only product names and balances).
 */
export interface SheetRow { label: string; unit: string; balance: number; quarantined: number }
export interface SheetSection { title: string; rows: SheetRow[] }

export const ddmmyyyy = (d: Date) => d.toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Dublin' });
export const hhmm = (d: Date) => d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Dublin' });

export function sheetLabel(p: { brand?: string | null; drug_name: string; strength: string; form: string }) {
  const name = p.brand && !p.brand.toLowerCase().includes(p.drug_name.toLowerCase()) ? `${p.brand} (${p.drug_name})` : p.brand || p.drug_name;
  return `${name} ${p.strength} ${p.form}`.replace(/\s+/g, ' ').trim();
}

export function buildSections(registers: any[]): SheetSection[] {
  const by = new Map<number, SheetRow[]>();
  for (const r of registers) {
    const s = Number(r.product?.schedule ?? 2);
    if (!by.has(s)) by.set(s, []);
    by.get(s)!.push({ label: sheetLabel(r.product), unit: r.product.unit, balance: Number(r.balance ?? 0), quarantined: Number(r.quarantined ?? 0) });
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([s, rows]) => ({
    title: `Schedule ${s}`,
    rows: rows.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true, sensitivity: 'base' })),
  }));
}

/** Styled .xlsx: big title, grey header row, schedule bands, difference formula highlighted when not zero. */
export async function downloadSheetXlsx(sections: SheetSection[], pharmacy: { name?: string | null; address?: string | null }, when: Date) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PharmacyCDReg.ie';
  wb.created = when;
  const ws = wb.addWorksheet('CD stock count', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: '&LPharmacyCDReg.ie&RPage &P of &N' },
    views: [{ state: 'frozen', ySplit: 6 }],
  });
  ws.columns = [{ width: 58 }, { width: 18 }, { width: 18 }, { width: 15 }, { width: 14 }];
  const green = 'FF184B21', light = 'FFE6F4E5', grey = 'FFB7B7B7';
  const thin = { style: 'thin' as const, color: { argb: 'FF9CA3AF' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };

  ws.mergeCells('A1:E1');
  Object.assign(ws.getCell('A1'), { value: 'CD Stock Count', font: { size: 24, bold: true, color: { argb: green } } });
  ws.getRow(1).height = 36;
  ws.mergeCells('A2:E2');
  Object.assign(ws.getCell('A2'), { value: [pharmacy.name, pharmacy.address].filter(Boolean).join(' · '), font: { size: 12, color: { argb: 'FF475569' } } });
  ws.mergeCells('A3:E3');
  Object.assign(ws.getCell('A3'), { value: `Date: ${ddmmyyyy(when)}      Register balances at ${hhmm(when)}`, font: { size: 14, bold: true } });
  ws.mergeCells('A4:E4');
  Object.assign(ws.getCell('A4'), { value: 'Counted by: ______________________      Checked by: ______________________', font: { size: 12 } });
  ws.getRow(4).height = 22;

  const head = ws.getRow(6);
  head.values = ['CD Medicine', 'Register', 'Stock', 'Difference', 'Initials'];
  head.height = 26;
  head.eachCell((c) => { c.font = { bold: true, size: 14 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grey } }; c.border = box; c.alignment = { vertical: 'middle', horizontal: Number(c.col) === 1 ? 'left' : 'center' }; });
  ws.pageSetup.printTitlesRow = '6:6';

  let r = 7;
  const diffs: string[] = [];
  for (const s of sections) {
    ws.mergeCells(`A${r}:E${r}`);
    const band = ws.getCell(`A${r}`);
    band.value = s.title;
    band.font = { bold: true, size: 13, color: { argb: green } };
    band.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: light } };
    band.border = box;
    ws.getRow(r).height = 22;
    r++;
    for (const row of s.rows) {
      const x = ws.getRow(r);
      x.values = [row.quarantined ? `${row.label}  (incl. ${row.quarantined} set aside)` : row.label, row.balance, null, { formula: `IF(C${r}="","",C${r}-B${r})` }, null];
      x.height = 26;
      x.eachCell({ includeEmpty: true }, (c) => {
        c.border = box;
        c.font = { size: 14, bold: Number(c.col) === 2 };
        c.alignment = { vertical: 'middle', horizontal: Number(c.col) === 1 ? 'left' : 'center', wrapText: Number(c.col) === 1 };
      });
      x.getCell(2).numFmt = `0" ${row.unit.replace(/"/g, '')}"`;
      diffs.push(`D${r}`);
      r++;
    }
  }
  if (diffs.length) {
    ws.addConditionalFormatting({
      ref: `D7:D${r - 1}`,
      rules: [{ type: 'expression', priority: 1, formulae: ['AND(D7<>"",D7<>0)'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFECACA' } }, font: { bold: true, color: { argb: 'FF991B1B' } } } }],
    });
  }
  r++;
  ws.mergeCells(`A${r}:E${r}`);
  Object.assign(ws.getCell(`A${r}`), { value: 'Any difference: investigate, then record it in the register with Stock check (the original lines stay; a correction is added).', font: { italic: true, size: 11, color: { argb: 'FF475569' } }, alignment: { wrapText: true } });
  ws.getRow(r).height = 30;

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `CD-stock-count-${when.toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
