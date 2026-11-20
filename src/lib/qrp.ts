/**
 * QuickReport (.QRP) files, as saved by Touchstore and other Windows dispensing systems: a small
 * header followed by one Windows enhanced metafile (EMF) per printed page. The report's text is in
 * EMR_EXTTEXTOUTW records with an x/y position, so it can be turned back into the printed lines
 * exactly (no OCR, no guessing). Each output line is the text at one height, left to right, with
 * " | " between cells; pages are separated by a blank line.
 */
const EMR_HEADER = 1, EMR_EOF = 14, EMR_EXTTEXTOUTW = 84, EMR_EXTTEXTOUTA = 83;

interface Cell { x: number; y: number; s: string }

function readEmf(buf: Buffer, start: number): { cells: Cell[]; end: number } | null {
  if (start < 0 || start + 88 > buf.length) return null;
  if (buf.readUInt32LE(start) !== EMR_HEADER || buf.toString('latin1', start + 40, start + 44) !== ' EMF') return null;
  const total = buf.readUInt32LE(start + 48);
  const end = Math.min(buf.length, start + (total || buf.length));
  const cells: Cell[] = [];
  let p = start;
  while (p + 8 <= end) {
    const type = buf.readUInt32LE(p), size = buf.readUInt32LE(p + 4);
    if (size < 8 || p + size > end) break;
    if ((type === EMR_EXTTEXTOUTW || type === EMR_EXTTEXTOUTA) && size >= 76) {
      const x = buf.readInt32LE(p + 36), y = buf.readInt32LE(p + 40);
      const n = buf.readUInt32LE(p + 44), off = buf.readUInt32LE(p + 48);
      const wide = type === EMR_EXTTEXTOUTW;
      const a = p + off, b = a + n * (wide ? 2 : 1);
      if (n > 0 && n < 4000 && b <= p + size) {
        const s = buf.toString(wide ? 'utf16le' : 'latin1', a, b).replace(/[\u0000-\u001f]/g, ' ').trim();
        if (s) cells.push({ x, y, s });
      }
    }
    if (type === EMR_EOF) { p += size; break; }
    p += size;
  }
  return { cells, end: p };
}

/** Lines of one page: cells within 4 units of the same height are one line. */
function toLines(cells: Cell[]): string[] {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Cell[][] = [];
  for (const c of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(c.y - row[0].y) <= 4) row.push(c); else rows.push([c]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x).map((c) => c.s).join(' | '));
}

/** A .QRP file (by name, or by an EMF page near the start). */
export function isQrp(name: string, buf: Buffer) {
  if (/\.qrp$/i.test(name)) return true;
  const sig = buf.indexOf(' EMF', 0, 'latin1');
  return sig >= 40 && sig < 4096 && !!readEmf(buf, sig - 40);
}

/** Every page's text cells. */
export function qrpPages(buf: Buffer): Cell[][] {
  const pages: Cell[][] = [];
  let from = 0;
  for (let guard = 0; guard < 500; guard++) {
    const sig = buf.indexOf(' EMF', from, 'latin1');
    if (sig < 0) break;
    const page = readEmf(buf, sig - 40);
    if (page && page.cells.length) pages.push(page.cells);
    from = Math.max(sig + 4, page?.end ?? 0);
  }
  return pages;
}

/** The report's text, or null if no pages could be found (e.g. a compressed or unknown variant). */
export function qrpToText(buf: Buffer): string | null {
  const pages = qrpPages(buf).map((c) => toLines(c).join('\n'));
  return pages.length ? pages.map((p, i) => (pages.length > 1 ? `--- Page ${i + 1} ---\n${p}` : p)).join('\n\n') : null;
}

export interface QrpRow { date: string; time: string | null; name: string | null; address: string | null; reference: string | null; product: string; quantity: number; owed: number | null; prescriber: string | null }

const isoOf = (d: string) => { const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };

/**
 * Touchstore "Controlled Drug Report": each dispensing is a line starting with the dispensed date
 * and time (then prescription date, patient, ID, address, scheme, script No., dispenser) and the
 * line under it (product, pack size, GMS No., IPU code, dosage, Qty. Disp, Qty. Ow'd, price,
 * prescriber). Cells are placed under the printed column headings by position. Null when the
 * headings aren't there (another layout: read it as text instead).
 */
export function touchstoreRows(pages: Cell[][]): QrpRow[] | null {
  const out: QrpRow[] = [];
  let found = false;
  for (const cells of pages) {
    const head = (label: RegExp) => cells.find((c) => label.test(c.s));
    const top = [head(/^Disp.d$/i), head(/^Patient Name$/i), head(/^Patient ID$/i), head(/^Address$/i), head(/^Scheme$/i), head(/^No\.?$/i), head(/^Dispenser$/i)];
    const bottom = [head(/^Product Name$/i), head(/^Pack Size$/i), head(/^GMS No\.?$/i), head(/^IPU Code$/i), head(/^Dosage$/i), head(/^Qty\.? ?Disp$/i), head(/^Qty\.? ?Ow.?d$/i), head(/^Price$/i), head(/^Prescriber Name$/i)];
    if (!top[1] || !bottom[0] || !bottom[5]) continue;
    found = true;
    const keysTop = ['disp', 'name', 'id', 'address', 'scheme', 'no', 'dispenser'];
    const keysBottom = ['product', 'pack', 'gms', 'ipu', 'dosage', 'qty', 'owed', 'price', 'prescriber'];
    const colsOf = (hs: (Cell | undefined)[], keys: string[]) => hs.map((h, i) => (h ? { x: h.x, k: keys[i] } : null)).filter(Boolean).sort((a, b) => a!.x - b!.x) as { x: number; k: string }[];
    const colTop = colsOf(top, keysTop), colBottom = colsOf(bottom, keysBottom);
    const headY = Math.max(...[...top, ...bottom].filter(Boolean).map((h) => h!.y));
    const assign = (row: Cell[], cols: { x: number; k: string }[]) => {
      const v: Record<string, string> = {};
      for (const c of row) {
        let k = cols[0].k;
        for (const col of cols) if (col.x <= c.x + 12) k = col.k;
        v[k] = v[k] ? `${v[k]} ${c.s}` : c.s;
      }
      return v;
    };
    const lines: Cell[][] = [];
    for (const c of [...cells].filter((c) => c.y > headY + 4).sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = lines[lines.length - 1];
      if (row && Math.abs(c.y - row[0].y) <= 4) row.push(c); else lines.push([c]);
    }
    for (let i = 0; i < lines.length - 1; i++) {
      const a = lines[i].sort((p, q) => p.x - q.x);
      if (!/^\d{1,2}\/\d{1,2}\/\d{4}/.test(a[0].s)) continue;
      const A = assign(a, colTop), B = assign(lines[i + 1].sort((p, q) => p.x - q.x), colBottom);
      const date = isoOf(A.disp ?? a[0].s);
      const qty = Number((B.qty ?? '').replace(/[^\d.]/g, ''));
      if (!date || !B.product || !qty) continue;
      out.push({
        date, time: (A.disp ?? '').match(/\d{1,2}:\d{2}/)?.[0] ?? null,
        name: A.name?.replace(/\s+/g, ' ').trim() || null, address: A.address?.trim() || null, reference: A.no?.trim() || null,
        product: B.product.trim(), quantity: qty, owed: B.owed ? Number(B.owed.replace(/[^\d.]/g, '')) || 0 : null,
        prescriber: B.prescriber?.trim() || null,
      });
      i++;
    }
  }
  return found ? out : null;
}
