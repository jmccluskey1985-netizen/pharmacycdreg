/**
 * Turn a saved/exported report file into text, whatever the dispensing system saved it as:
 * Excel (.xlsx), web page (.html/.htm), XML, rich text (.rtf), CSV/TSV/TXT/PRN or any other
 * mostly-text file. PDFs and images are recognised by their content (even with an odd name or
 * no file type) and returned as documents for the reader. Null when it can't be read at all.
 */
export type Extracted = { kind: 'text'; text: string } | { kind: 'doc'; mediaType: string } | { kind: 'unsupported'; why: string } | null;

const startsWith = (b: Buffer, sig: number[]) => sig.every((v, i) => b[i] === v);

export function sniffDoc(buf: Buffer, type: string): string | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // %PDF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(type)) return type;
  return null;
}

function decodeText(buf: Buffer): string | null {
  if (!buf.length) return null;
  let text: string;
  if (startsWith(buf, [0xff, 0xfe]) || (buf.length > 3 && buf[1] === 0 && buf[3] === 0)) text = buf.toString('utf16le');
  else text = buf.toString('utf8');
  text = text.replace(/^\ufeff/, '');
  const sample = text.slice(0, 20000);
  const printable = sample.replace(/[^\t\n\r\x20-\x7e -ɏ‘-”€]/g, '').length;
  return printable / Math.max(1, sample.length) > 0.92 ? text.replace(/^﻿/, '') : null;
}

const htmlToText = (h: string) => h
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/(td|th)>\s*/gi, ' | ').replace(/<(br|\/tr|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/ *\| *\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const rtfToText = (r: string) => r
  .replace(/\\par[d]?/g, '\n').replace(/\\cell/g, ' | ').replace(/\\row/g, '\n').replace(/\\tab/g, ' | ')
  .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/ *\| */g, ' | ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

async function xlsxToText(buf: Buffer): Promise<string | null> {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const out: string[] = [];
    wb.eachSheet((ws) => {
      out.push(`--- ${ws.name} ---`);
      ws.eachRow((row) => {
        const cells = (row.values as any[]).slice(1).map((v) => {
          if (v == null) return '';
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map((t: any) => t.text).join('') ?? '');
          return String(v);
        });
        if (cells.some((c) => c.trim())) out.push(cells.join(' | '));
      });
    });
    return out.length ? out.join('\n') : null;
  } catch { return null; }
}

export async function extractReport(name: string, type: string, buf: Buffer): Promise<Extracted> {
  const doc = sniffDoc(buf, type);
  if (doc) return { kind: 'doc', mediaType: doc };
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) {
    return { kind: 'unsupported', why: ext === 'rpt' ? 'a Crystal Reports file (.rpt)' : ext === 'doc' ? 'an older Word file (.doc)' : 'an older Excel or Office file (.xls)' };
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) { // zip: Excel .xlsx (Word/other zips aren't reports we can read)
    const t = await xlsxToText(buf);
    return t ? { kind: 'text', text: t } : null;
  }
  const raw = decodeText(buf);
  if (!raw) return null;
  if (/^(html?|xhtml|mht)$/.test(ext) || /^\s*<(!doctype html|html|table)/i.test(raw)) return { kind: 'text', text: htmlToText(raw) };
  if (ext === 'rtf' || raw.startsWith('{\\rtf')) return { kind: 'text', text: rtfToText(raw) };
  if (ext === 'xml' || raw.trimStart().startsWith('<?xml')) return { kind: 'text', text: htmlToText(raw.replace(/<\/[^>]+>\s*<(?!\/)/g, (m) => m.replace('<', ' | <'))) };
  return { kind: 'text', text: raw };
}
