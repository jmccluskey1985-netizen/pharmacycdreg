import { normBrand } from '@/data/cd-products';

interface Proposal {
  register_id: string | null;
  item: { brand?: string | null; drug_name: string; strength: string; form: string; is_credit?: boolean };
  qty: { quantity: number | null; label: string; flags: string[]; blocking?: boolean };
  draft: { quantity: number | string };
}

/**
 * The same product on more than one line of an invoice or docket (e.g. two lines of Durogesic
 * 12mcg/hr, 2 × 5 each) is one delivery into one book: combine them into a single receipt, in place.
 * Recorded separately, the second line would hit the "same docket already received" guard, and
 * with no book yet each line would try to start its own book. Credit lines and lines without a
 * quantity are left alone.
 */
export function combineRepeatLines<T extends Proposal>(proposals: T[]): T[] {
  const key = (p: Proposal) => [p.register_id ?? '', normBrand(p.item.brand) ?? '', p.item.drug_name, p.item.strength, p.item.form].join('|').toLowerCase().replace(/\s+/g, '');
  const usable = (p: Proposal) => !p.item.is_credit && p.qty.quantity != null;
  for (let i = 0; i < proposals.length; i++) {
    const a = proposals[i];
    if (!usable(a)) continue;
    const parts = [a.qty.label];
    for (let j = i + 1; j < proposals.length; ) {
      const b = proposals[j];
      if (!usable(b) || key(a) !== key(b)) { j++; continue; }
      parts.push(b.qty.label);
      const total = Number(a.qty.quantity) + Number(b.qty.quantity);
      a.qty = { ...a.qty, quantity: total, flags: [...new Set([...a.qty.flags, ...b.qty.flags])], blocking: !!(a.qty.blocking || b.qty.blocking) };
      a.draft = { ...a.draft, quantity: total };
      proposals.splice(j, 1);
    }
    if (parts.length > 1) {
      a.qty.label = `${parts.join(' + ')} = ${a.qty.quantity}`;
      a.qty.flags.unshift(`${parts.length} lines of this product on the invoice, combined into one receipt.`);
    }
  }
  return proposals;
}
