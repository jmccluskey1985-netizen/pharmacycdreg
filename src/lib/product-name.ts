import { productFor } from '@/data/cd-products';

export interface ProductLike { drug_name: string; strength: string; form: string; brand?: string | null }

/** Brand for a register product: stored brand, else the usual brand from the CD list, else null. */
export function brandOf(p: ProductLike): string | null {
  return (p.brand && p.brand.trim()) || productFor(p.drug_name, p.form)?.brands[0] || null;
}

/** "OxyNorm 5mg capsule" — brand first (CDs are prescribed by brand); generic if no brand known. */
export function productTitle(p: ProductLike): string {
  const b = brandOf(p);
  return `${b ?? p.drug_name} ${p.strength} ${p.form}`;
}

/** The generic line shown under the brand: "Oxycodone hydrochloride". Null when the title is already generic. */
export function genericLine(p: ProductLike): string | null {
  return brandOf(p) ? p.drug_name : null;
}
