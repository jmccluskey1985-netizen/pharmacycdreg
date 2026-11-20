import type { ReportRow } from '@/lib/report-reconcile';

/**
 * CSV / TSV exports of dispensing reports (e.g. MPS "Drug Search Report" saved as CSV, or any
 * other system's export) read exactly by their column headings: no AI reader needed. Title lines
 * above the headings are skipped. Null when no date + quantity headings are found (then the text
 * goes to the reader instead).
 */
export function parseCsv(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 30).join('\n');
  const delim = [',', ';', '\t', '|'].map((d) => [d, sample.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const out: string[][] = [];
  for (const line of lines) {
    const cells: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { cells.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    cells.push(cur.trim());
    out.push(cells);
  }
  return out;
}

const COLS: [keyof Cols, RegExp][] = [
  ['date', /^(date ?dispensed|dispensed ?date|disp(ensed)?'?d?( date)?|date( of supply)?|supply date|date\/time|dispensed on)$/i],
  ['name', /^(patient( name)?|name|patient full name|surname)$/i],
  ['product', /^(script dispensed as|dispensed as|product( name)?|drug( name)?|item( name)?|description|medicine|medication|preparation)$/i],
  ['quantity', /^(qty|quantity|qty\.? ?disp(ensed)?|quantity dispensed|amount|units)$/i],
  ['address', /^(patient )?address( line ?1)?$/i],
  ['prescriber', /^(prescriber( name)?|doctor|gp|prescribing doctor)$/i],
  ['reference', /^(script no\.?|rx no\.?|prescription no\.?|no\.?|reference|ref|item no\.?)$/i],
];
interface Cols { date: number; name: number; product: number; quantity: number; address: number; prescriber: number; reference: number }

function isoDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = Number(m[1]), mo = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function csvReportRows(text: string): ReportRow[] | null {
  const rows = parseCsv(text);
  for (let h = 0; h < Math.min(rows.length, 30); h++) {
    const cols: Partial<Cols> = {};
    rows[h].forEach((cell, i) => {
      const c = cell.replace(/\s+/g, ' ').trim();
      for (const [k, re] of COLS) if (cols[k] === undefined && re.test(c)) { cols[k] = i; break; }
    });
    if (cols.date === undefined || cols.quantity === undefined) continue;
    const out: ReportRow[] = [];
    for (const r of rows.slice(h + 1)) {
      const date = isoDate(r[cols.date] ?? '');
      const qty = Number(String(r[cols.quantity] ?? '').replace(/[^\d.]/g, ''));
      if (!date || !qty) continue; // totals, blank lines, page headers
      const get = (k: keyof Cols) => (cols[k] !== undefined ? (r[cols[k]!] ?? '').trim() || null : null);
      out.push({ date, kind: 'supply', name: get('name'), address: get('address'), prescriber: get('prescriber'), reference: get('reference'), quantity: qty, product: get('product') });
    }
    return out;
  }
  return null;
}
