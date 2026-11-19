import { genericKey, sameStrength, isTapentadol, tapentadolForm } from '@/lib/cd-catalogue';
import { brandOf } from '@/lib/product-name';
import { normBrand } from '@/data/cd-products';

export interface RegisterOption { id: string; label: string; drug_name: string; strength: string; form: string; unit: string; class_name: string; brand?: string | null }

export type MatchState = 'your_register' | 'pick_register' | 'no_register' ;

/**
 * Same brand? Exact, or one name inside the other once spacing is ignored: a docket's "Rowex"
 * is the "Methadone Rowex" book, "DTF" the "Methadone DTF" one. Different brands (OxyNorm vs
 * Shortec) never match.
 */
export function sameBrand(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const sa = a.toLowerCase().replace(/[^a-z0-9]/g, ''), sb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (sa === sb) return true;
  const [short, long] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  return short.length >= 3 && long.includes(short);
}

/**
 * Halo-style resolve(): your own registers first (YOUR LIST). Name compared as a
 * generic (brand → generic, salts dropped), strength compared numerically with units
 * normalised. A unique match wins; several → the pharmacist picks; none → open a
 * register (never a silent guess).
 */
export function matchRegister(regs: RegisterOption[], drugName: string, strength: string, form?: string, brand?: string | null) {
  const keys = [genericKey(drugName), brand ? genericKey(brand) : null].filter(Boolean) as string[];
  const tapentadol = isTapentadol(drugName) || isTapentadol(brand);
  const sameDrug = regs.filter((r) => {
    if (tapentadol) return [r.drug_name, r.class_name, r.brand].some(isTapentadol);
    const rk = genericKey(r.drug_name), ck = genericKey(r.class_name);
    return keys.some((k) => k.length > 2 && (k === rk || k === ck || rk.startsWith(k) || k.startsWith(rk)));
  });
  const readForm = tapentadol ? tapentadolForm(drugName, form, brand) : null;
  const compatible = readForm ? sameDrug.filter((r) => tapentadolForm(r.drug_name, r.form, r.brand) === readForm) : sameDrug;
  let exact = compatible.filter((r) => sameStrength(r.strength, strength));
  if (!tapentadol && exact.length > 1 && form) {
    const f = form.toLowerCase();
    const byForm = exact.filter((r) => f.includes(r.form.toLowerCase().split(' ').pop()!) || r.form.toLowerCase().includes(f.split(' ').pop()!));
    if (byForm.length) exact = byForm;
  }
  // Brands are not interchangeable (OxyNorm ≠ Shortec): a read brand only goes in that brand's book.
  const writtenBrand = brand || drugName.trim().match(/^palexia(?:[ -]+sr)?\b/i)?.[0];
  const b = normBrand(writtenBrand)?.toLowerCase();
  if (b && tapentadol) {
    const branded = compatible.filter((r) => normBrand(brandOf(r))?.toLowerCase() === b);
    const strengthMatches = branded.filter((r) => sameStrength(r.strength, strength));
    const match = readForm && strengthMatches.length === 1 ? strengthMatches[0] : null;
    const state: MatchState = match ? 'your_register' : branded.length ? 'pick_register' : 'no_register';
    return { match, state, candidates: strengthMatches.length ? strengthMatches : branded, otherBrands: branded.length ? [] : exact };
  }
  if (b && exact.length) {
    const regBrand = (r: RegisterOption) => normBrand(brandOf(r))?.toLowerCase() ?? null;
    const same = exact.filter((r) => sameBrand(regBrand(r), b));
    const unbranded = exact.filter((r) => regBrand(r) === null);
    if (same.length) exact = same;
    else if (unbranded.length) exact = unbranded;
    else return { match: null, state: 'no_register' as MatchState, candidates: [], otherBrands: exact };
  }
  const match = exact.length === 1 && (!tapentadol || readForm) ? exact[0] : null;
  const state: MatchState = match ? 'your_register' : compatible.length ? 'pick_register' : 'no_register';
  return { match, state, candidates: exact.length ? exact : compatible, otherBrands: [] as RegisterOption[] };
}
