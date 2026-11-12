/**
 * Register quantity rules, after Halo's framework: the reader reports what is on the
 * page; these rules decide the number and say HOW (provenance), and flag rather than
 * guess. Different from Halo on purpose for CDs: a controlled-drug prescription's
 * total must be written in words and figures, so we never work a quantity out from a
 * dose × duration, and we never round to packs.
 */
import { packSizeFromText } from './invoice-rules';

export type QtySource = 'packs_x_size' | 'invoice_quantity' | 'words_and_figures' | 'figures_only' | 'none';

export interface QtyDecision {
  quantity: number | null;
  source: QtySource;
  label: string; // shown to the pharmacist, e.g. "2 packs × 56 = 112"
  flags: string[]; // anything that must be checked before signing
  blocking: boolean; // true → can't be confirmed as-is
}

const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "one hundred and twelve" / "twenty-eight" / "56 (fifty six)" → number. */
export function wordsToNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const words = text.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter((w) => w && w !== 'and');
  if (!words.length) return null;
  let total = 0, cur = 0, seen = false;
  for (const w of words) {
    if (w in ONES) { cur += ONES[w]; seen = true; }
    else if (w in TENS) { cur += TENS[w]; seen = true; }
    else if (w === 'hundred') { cur = (cur || 1) * 100; seen = true; }
    else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; seen = true; }
    else if (['tablets', 'tabs', 'capsules', 'caps', 'ml', 'millilitres', 'patches', 'only', 'units', 'x', 'of'].includes(w)) continue;
    else return null; // unknown word: don't guess
  }
  return seen ? total + cur : null;
}

const figure = (s: string | null | undefined) => {
  if (!s) return null;
  const m = s.replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const PACK_UNITS = /^(op|o\.p\.|original pack|packs?|box(es)?|cartons?)$/i;

export interface RawItem {
  quantity: number;
  quantity_unit: string;
  packs: number | null;
  pack_size: number | null;
  quantity_figures: string | null;
  quantity_words: string | null;
  duration_text: string | null;
  is_credit: boolean;
  confidence: 'high' | 'medium' | 'low';
  line_text?: string | null;
  handwritten_qty?: string | null;
}

export function decideQuantity(item: RawItem, kind: 'invoice' | 'prescription' | 'other'): QtyDecision {
  const flags: string[] = [];
  if (item.confidence === 'low') flags.push('Low-confidence read — check against the paper');
  if (PACK_UNITS.test((item.quantity_unit || '').trim())) {
    return { quantity: null, source: 'none', label: `Written as ${item.quantity} ${item.quantity_unit}`, flags: [...flags, 'Pack quantity, not units — enter the number of tablets/ml/patches'], blocking: true };
  }

  if (kind === 'invoice') {
    if (item.is_credit) return { quantity: null, source: 'none', label: 'Credit / return line', flags: [...flags, 'Credit or return — not a receipt. Record a correction if stock was already entered'], blocking: true };
    // Handwritten change by the qty (e.g. printed 8, written 5 = what arrived). A tick is fine.
    let blocking = false;
    const hw = (item.handwritten_qty || '').match(/\d+(\.\d+)?/);
    if (hw && item.packs != null && Number(hw[0]) !== item.packs) {
      flags.push(`Handwritten “${item.handwritten_qty}” beside printed ${item.packs} — confirm how many packs actually arrived`);
      blocking = true;
    }
    const fromText = packSizeFromText(item.line_text);
    if (item.packs != null && item.pack_size == null && fromText != null) {
      item = { ...item, pack_size: fromText };
      flags.push(`Pack size ${fromText} taken from the printed line — check`);
    } else if (item.pack_size != null && fromText != null && fromText !== item.pack_size && item.line_text && !new RegExp(`\\b${item.pack_size}\\b`).test(item.line_text)) {
      flags.push(`Pack size ${item.pack_size} not on the printed line (it shows ${fromText}) — check the PACK column`);
      blocking = true;
    }
    if (item.packs != null && item.pack_size != null) {
      const q = item.packs * item.pack_size;
      if (item.quantity && Math.abs(item.quantity - q) > 0.001) flags.push(`Reader said ${item.quantity}, packs × size gives ${q} — using ${q}`);
      return { quantity: q, source: 'packs_x_size', label: `${item.packs} pack${item.packs === 1 ? '' : 's'} × ${item.pack_size} = ${q}`, flags, blocking };
    }
    if (item.packs != null && item.pack_size == null) flags.push('Pack size not found in the description — check units per pack');
    return { quantity: item.quantity || null, source: item.quantity ? 'invoice_quantity' : 'none', label: item.quantity ? `${item.quantity} ${item.quantity_unit}` : 'No quantity read', flags, blocking: !item.quantity };
  }

  if (kind === 'prescription') {
    const fig = figure(item.quantity_figures);
    const words = wordsToNumber(item.quantity_words);
    if (fig != null && words != null) {
      if (fig !== words) return { quantity: null, source: 'none', label: `Figures ${fig} ≠ words ${words}`, flags: [...flags, 'Words and figures disagree — the prescription is not valid for supply as written'], blocking: true };
      return { quantity: fig, source: 'words_and_figures', label: `${fig} (words and figures agree)`, flags, blocking: false };
    }
    if (fig != null) {
      return { quantity: fig, source: 'figures_only', label: `${fig} (figures only)`, flags: [...flags, 'Total not written in words — a CD prescription needs words and figures'], blocking: false };
    }
    if (item.duration_text) flags.push(`Only a duration (“${item.duration_text}”) — total quantity must be written; not calculated`);
    return { quantity: null, source: 'none', label: 'No total quantity written', flags: [...flags, 'No total in words and figures — check the prescription before supplying'], blocking: true };
  }

  return { quantity: item.quantity || null, source: item.quantity ? 'invoice_quantity' : 'none', label: `${item.quantity ?? '?'} ${item.quantity_unit}`, flags: [...flags, 'Not recognised as an invoice or prescription'], blocking: true };
}
