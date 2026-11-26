import { productFor, normBrand } from '@/data/cd-products';

export interface ProductLike { drug_name: string; strength: string; form: string; brand?: string | null }

/**
 * Brand for a register product: the stored brand in its standard spelling ("MST" and
 * "MST CONTINUS" both read "MST Continus"), else the usual brand from the CD list, else null.
 */
export function brandOf(p: ProductLike): string | null {
  return tidyCase(normBrand(p.brand)) || productFor(p.drug_name, p.form)?.brands[0] || null;
}

/** Brands not in the CD list keep their spelling, except SHOUTING from invoices: "ROWEX" → "Rowex". */
function tidyCase(b: string | null): string | null {
  if (!b || b.length < 5 || b !== b.toUpperCase() || !/[A-Z]{4}/.test(b)) return b;
  return b.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, s, c) => s + c.toUpperCase());
}

/** "OxyNorm 5mg capsule", brand first (CDs are prescribed by brand); generic if no brand known. */
export function productTitle(p: ProductLike): string {
  const b = brandOf(p);
  return `${b ?? p.drug_name} ${p.strength} ${p.form}`;
}

/** The generic line shown under the brand: "Oxycodone hydrochloride". Null when the title is already generic. */
export function genericLine(p: ProductLike): string | null {
  return brandOf(p) ? p.drug_name : null;
}
