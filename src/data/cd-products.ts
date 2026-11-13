/**
 * Common Schedule 2 controlled drug products in Irish community pharmacy — the ones that
 * need a register. Used to set up registers quickly and to search by brand
 * ("OxyContin" → oxycodone prolonged-release, 5/10/20 mg…).
 *
 * Not exhaustive: anything missing can be added by hand in "Open register". Schedule 5
 * exemptions (e.g. Oramorph 10mg/5ml) are deliberately not listed.
 */
export interface CdProduct {
  key: string;
  class: string; // "part" of the register, e.g. Oxycodone
  generic: string; // drug name on the register
  brands: string[];
  form: string;
  unit: 'tablets' | 'capsules' | 'ml' | 'patches' | 'ampoules' | 'vials';
  strengths: string[];
  schedule: 2;
  para: 'para 1';
  family?: string; // products that are the same drug/form but different brands
}

interface Family { key: string; cls: string; generic: string; brands: string[]; form: string; unit: CdProduct['unit']; strengths: string[] }
const f = (key: string, cls: string, generic: string, brands: string[], form: string, unit: CdProduct['unit'], strengths: string[]): Family => ({ key, cls, generic, brands, form, unit, strengths });

/**
 * Product families. Each BRAND becomes its own product and its own register: brands are not
 * interchangeable (OxyNorm ≠ Shortec capsules; Durogesic ≠ Matrifen patches). An empty brand
 * list means a generic product (one register, named by the generic). Not exhaustive — any other
 * brand (e.g. Rowex) can be added when opening a CD book.
 */
const FAMILIES: Family[] = [
  // Oxycodone
  f('oxy-caps', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyNorm', 'Shortec'], 'capsule', 'capsules', ['5mg', '10mg', '20mg']),
  f('oxy-pr', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyContin', 'Longtec', 'Oxypro', 'Reltebon'], 'prolonged-release tablet', 'tablets', ['5mg', '10mg', '15mg', '20mg', '30mg', '40mg', '60mg', '80mg']),
  f('oxy-liq', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyNorm', 'Shortec'], 'oral solution', 'ml', ['5mg/5ml']),
  f('oxy-conc', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyNorm', 'Shortec'], 'concentrated oral solution', 'ml', ['10mg/ml']),
  f('oxy-inj', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyNorm'], 'injection', 'ampoules', ['10mg/ml', '50mg/ml']),
  f('oxynal-pr', 'Oxycodone', 'Oxycodone / naloxone', ['Targin'], 'prolonged-release tablet', 'tablets', ['5mg/2.5mg', '10mg/5mg', '20mg/10mg', '40mg/20mg']),
  // Morphine
  f('mor-pr-tab', 'Morphine', 'Morphine sulfate', ['MST Continus'], 'prolonged-release tablet', 'tablets', ['5mg', '10mg', '15mg', '30mg', '60mg', '100mg', '200mg']),
  f('mor-pr-cap', 'Morphine', 'Morphine sulfate', ['Zomorph'], 'prolonged-release capsule', 'capsules', ['10mg', '30mg', '60mg', '100mg', '200mg']),
  f('mor-tab', 'Morphine', 'Morphine sulfate', ['Sevredol'], 'tablet', 'tablets', ['10mg', '20mg']),
  f('mor-conc', 'Morphine', 'Morphine sulfate', ['Oramorph'], 'concentrated oral solution', 'ml', ['20mg/ml']),
  f('mor-inj', 'Morphine', 'Morphine sulfate', [], 'injection', 'ampoules', ['10mg/ml', '15mg/ml', '30mg/ml']),
  // Fentanyl
  f('fen-patch', 'Fentanyl', 'Fentanyl', ['Durogesic', 'Matrifen', 'Fencino', 'Mezolar', 'Victanyl'], 'transdermal patch', 'patches', ['12mcg/hr', '25mcg/hr', '37.5mcg/hr', '50mcg/hr', '75mcg/hr', '100mcg/hr']),
  f('fen-sl', 'Fentanyl', 'Fentanyl', ['Abstral'], 'sublingual tablet', 'tablets', ['100mcg', '200mcg', '300mcg', '400mcg', '600mcg', '800mcg']),
  f('fen-inj', 'Fentanyl', 'Fentanyl', [], 'injection', 'ampoules', ['50mcg/ml']),
  // Tapentadol
  f('tap-tab', 'Tapentadol', 'Tapentadol', ['Palexia'], 'tablet', 'tablets', ['50mg']),
  f('tap-pr', 'Tapentadol', 'Tapentadol', ['Palexia SR'], 'prolonged-release tablet', 'tablets', ['25mg', '50mg', '100mg', '150mg', '200mg', '250mg']),
  f('tap-liq', 'Tapentadol', 'Tapentadol', ['Palexia'], 'oral solution', 'ml', ['20mg/ml']),
  // Hydromorphone
  f('hyd-cap', 'Hydromorphone', 'Hydromorphone hydrochloride', ['Palladone'], 'capsule', 'capsules', ['1.3mg', '2.6mg']),
  f('hyd-pr', 'Hydromorphone', 'Hydromorphone hydrochloride', ['Palladone SR'], 'prolonged-release capsule', 'capsules', ['2mg', '4mg', '8mg', '16mg', '24mg']),
  // Methadone
  f('met-liq', 'Methadone', 'Methadone hydrochloride', ['Physeptone', 'Martindale'], 'oral solution', 'ml', ['1mg/ml']),
  f('met-tab', 'Methadone', 'Methadone hydrochloride', ['Physeptone'], 'tablet', 'tablets', ['5mg']),
  // Pethidine / diamorphine
  f('pet-inj', 'Pethidine', 'Pethidine hydrochloride', [], 'injection', 'ampoules', ['50mg/ml']),
  f('dia-inj', 'Diamorphine', 'Diamorphine hydrochloride', [], 'powder for injection', 'ampoules', ['5mg', '10mg', '30mg', '100mg']),
  // Stimulants (ADHD)
  f('mph-tab', 'Methylphenidate', 'Methylphenidate hydrochloride', ['Ritalin', 'Medikinet', 'Tranquilyn'], 'tablet', 'tablets', ['5mg', '10mg', '20mg']),
  f('mph-pr', 'Methylphenidate', 'Methylphenidate hydrochloride', ['Concerta XL', 'Xaggitin XL', 'Delmosart'], 'prolonged-release tablet', 'tablets', ['18mg', '27mg', '36mg', '54mg']),
  f('mph-mr', 'Methylphenidate', 'Methylphenidate hydrochloride', ['Ritalin LA', 'Medikinet XL', 'Equasym XL'], 'modified-release capsule', 'capsules', ['5mg', '10mg', '20mg', '30mg', '40mg', '50mg', '60mg']),
  f('lis-cap', 'Lisdexamfetamine', 'Lisdexamfetamine dimesylate', ['Elvanse'], 'capsule', 'capsules', ['20mg', '30mg', '40mg', '50mg', '60mg', '70mg']),
  f('dex-tab', 'Dexamfetamine', 'Dexamfetamine sulfate', ['Amfexa'], 'tablet', 'tablets', ['5mg', '10mg', '20mg']),
  // Other
  f('ket-inj', 'Ketamine', 'Ketamine', ['Ketalar'], 'injection', 'vials', ['10mg/ml', '50mg/ml', '100mg/ml']),
];

const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** One product per brand (or one generic product). `brands` holds exactly that brand. */
export const CD_PRODUCTS: CdProduct[] = FAMILIES.flatMap((fam) =>
  (fam.brands.length ? fam.brands : [null]).map((brand) => ({
    key: brand ? `${fam.key}-${slug(brand)}` : fam.key, family: fam.key, class: fam.cls, generic: fam.generic,
    brands: brand ? [brand] : [], form: fam.form, unit: fam.unit, strengths: fam.strengths, schedule: 2 as const, para: 'para 1' as const,
  })),
);

/** Other spellings seen on prescriptions and invoices → the brand's register name. */
const BRAND_ALIASES: Record<string, string> = {
  oxynorm: 'OxyNorm', 'oxynorm liquid': 'OxyNorm', 'oxynorm concentrate': 'OxyNorm', 'shortec liquid': 'Shortec', 'shortec concentrate': 'Shortec',
  mst: 'MST Continus', targinact: 'Targin', concerta: 'Concerta XL', 'oramorph concentrated': 'Oramorph', 'oramorph concentrate': 'Oramorph',
  'durogesic dtrans': 'Durogesic', 'physeptone tablets': 'Physeptone', 'methadone martindale': 'Martindale',
};
/** "MST" → "MST Continus", "oxynorm" → "OxyNorm"; unknown brands are kept as written. */
export function normBrand(b: string | null | undefined): string | null {
  if (!b || !b.trim()) return null;
  const k = b.trim().toLowerCase().replace(/\s+/g, ' ');
  if (BRAND_ALIASES[k]) return BRAND_ALIASES[k];
  for (const p of CD_PRODUCTS) for (const x of p.brands) if (x.toLowerCase() === k) return x;
  return b.trim();
}

const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Search by brand, generic, class or form, e.g. "oxycontin", "mst", "fentanyl patch". */
export function searchCdProducts(q: string): CdProduct[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).map(n).filter(Boolean);
  if (!words.length) return CD_PRODUCTS;
  return CD_PRODUCTS.filter((x) => {
    const hay = n([x.class, x.generic, x.form, ...x.brands, ...x.strengths].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

const formKey = (f: string) => f.toLowerCase().replace(/s$/, '').replace(/\s+/g, ' ').trim();
const genKey = (g: string) => g.toLowerCase().replace(/\b(hydrochloride|sulfate|sulphate|hcl|tartrate|citrate|dimesylate)\b/g, '').replace(/[^a-z/]/g, '');

/** The catalogue product for a register (generic + form, and brand when known). */
export function productFor(drugName: string, form: string, brand?: string | null): CdProduct | null {
  const g = genKey(drugName), fk = formKey(form);
  const same = CD_PRODUCTS.filter((p) => genKey(p.generic) === g && formKey(p.form) === fk);
  const b = normBrand(brand)?.toLowerCase();
  return (b ? same.find((p) => p.brands[0]?.toLowerCase() === b) : undefined) ?? same[0] ?? null;
}

/** Type label used to group a drug's registers: "OxyNorm · capsule", "OxyContin · prolonged-release tablet". */
export function typeLabel(drugName: string, form: string): string {
  const p = productFor(drugName, form);
  return p ? `${p.brands[0] ?? p.generic} · ${p.form}` : form;
}

const SOLID = /tablet|capsule|caps?\b|tab\b/i;
const MODIFIED = /prolonged|modified|sustained|extended|controlled|\bsr\b|\bxl\b|\bla\b|\bpr\b|retard/i;

/**
 * The form a brand actually comes in. A prescription that says "OxyNorm … tablet" means
 * OxyNorm capsules (OxyNorm has no tablet). Only changes a solid oral form, and only when
 * the brand has exactly one plain (or exactly one modified-release) solid form.
 */
export function canonicalForm(brand: string | null | undefined, form: string): { form: string; unit: CdProduct['unit'] } | null {
  if (!brand || !form) return null;
  const b = (normBrand(brand) ?? brand).trim().toLowerCase();
  let matches = CD_PRODUCTS.filter((p) => p.brands.some((x) => x.toLowerCase() === b));
  if (!matches.length) matches = CD_PRODUCTS.filter((p) => p.brands.some((x) => x.toLowerCase().startsWith(b) || b.startsWith(x.toLowerCase())));
  if (!matches.length || !SOLID.test(form)) return null;
  if (matches.some((p) => formKey(p.form) === formKey(form))) return null; // already a real form of this brand
  const wantModified = MODIFIED.test(form);
  const solidAll = matches.filter((p) => SOLID.test(p.form));
  const solid = solidAll.filter((p) => MODIFIED.test(p.form) === wantModified);
  const pick = solid.length === 1 ? solid[0] : solidAll.length === 1 ? solidAll[0] : null; // e.g. MST only comes prolonged-release
  return pick ? { form: pick.form, unit: pick.unit } : null;
}
