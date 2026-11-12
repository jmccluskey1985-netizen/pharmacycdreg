import { searchCdProducts, productFor } from '@/data/cd-products';

export interface RegLike { id: string; product: { drug_name: string; strength: string; form: string; class_name: string } }

/** Registers matching a search: brand (OxyContin → oxycodone PR), generic, class, strength or form. */
export function filterRegisters<T extends RegLike>(regs: T[], q: string): T[] {
  const t = q.trim().toLowerCase();
  if (!t) return regs;
  const products = searchCdProducts(t);
  return regs.filter((r) => {
    const p = productFor(r.product.drug_name, r.product.form);
    if (p && products.includes(p)) {
      // brand search should still respect a strength typed alongside it ("oxycontin 10")
      const nums = t.match(/\d+(\.\d+)?/g);
      return !nums || nums.every((n) => r.product.strength.replace(/\s/g, '').includes(n));
    }
    return t.split(/\s+/).every((w) => `${r.product.drug_name} ${r.product.class_name} ${r.product.strength} ${r.product.form}`.toLowerCase().includes(w));
  });
}
