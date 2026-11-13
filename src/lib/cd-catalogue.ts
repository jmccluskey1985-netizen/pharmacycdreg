/**
 * Brand → generic for controlled drugs commonly stocked in Irish community pharmacy
 * (Halo's molecule_aliases idea, CD-only). Used so "OxyNorm 5mg" on an invoice or
 * from Halo matches the "Oxycodone hydrochloride 5mg" register.
 *
 * Starter list: replace/extend from Halo's reference data (agent/reference, the
 * CONTROLLED list in rx_validity.py) so both systems agree.
 */
export const BRAND_TO_GENERIC: Record<string, string> = {
  oxynorm: 'oxycodone', oxycontin: 'oxycodone', longtec: 'oxycodone', shortec: 'oxycodone', reltebon: 'oxycodone', oxypro: 'oxycodone',
  targin: 'oxycodone naloxone',
  mst: 'morphine', 'mst continus': 'morphine', zomorph: 'morphine', sevredol: 'morphine', oramorph: 'morphine',
  durogesic: 'fentanyl', matrifen: 'fentanyl', fencino: 'fentanyl', abstral: 'fentanyl', effentora: 'fentanyl', instanyl: 'fentanyl', pecfent: 'fentanyl',
  palladone: 'hydromorphone',
  palexia: 'tapentadol',
  physeptone: 'methadone',
  ritalin: 'methylphenidate', concerta: 'methylphenidate', medikinet: 'methylphenidate', equasym: 'methylphenidate', 'equasym xl': 'methylphenidate', delmosart: 'methylphenidate', xaggitin: 'methylphenidate',
  elvanse: 'lisdexamfetamine',
  amfexa: 'dexamfetamine',
  butrans: 'buprenorphine', transtec: 'buprenorphine', subutex: 'buprenorphine', suboxone: 'buprenorphine naloxone', espranor: 'buprenorphine',
};

const SALTS = /\b(hydrochloride|hcl|sulfate|sulphate|tartrate|citrate|bitartrate|dimesylate|mesylate|acetate|phosphate|base|anhydrous|monohydrate|pentahydrate)\b/g;

/** "Oxycodone Hydrochloride" / "OxyNorm" → "oxycodone". */
export function genericKey(name: string): string {
  const n = name.toLowerCase().replace(/®|™/g, '').replace(/[^a-z\s/+-]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const brand of Object.keys(BRAND_TO_GENERIC).sort((a, b) => b.length - a.length)) {
    if (n === brand || n.startsWith(brand + ' ')) return BRAND_TO_GENERIC[brand];
  }
  return n.replace(SALTS, '').replace(/\s+/g, ' ').trim();
}

/**
 * Strength as comparable numbers in a base unit: "100 mcg" and "0.1MG" both → 0.1mg;
 * "10mg/5ml" → 2mg/ml; "25micrograms/hour" → 0.025mg/h. Returns null if unparseable.
 */
export function normStrength(raw: string): string | null {
  const s = raw.toLowerCase().replace(/\s+/g, '').replace(/micrograms?|µg|ug/g, 'mcg').replace(/milligrams?/g, 'mg').replace(/grams?\b/g, 'g').replace(/millilitres?|mls?\b/g, 'ml').replace(/hours?|hrs?|hr\b/g, 'h');
  const m = s.match(/^([\d.]+)(mcg|mg|g|mmol|units?|iu)?(?:\/([\d.]*)(ml|h|dose|actuation)?)?/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  const unit = m[2] ?? 'mg';
  if (unit === 'mcg') v /= 1000;
  if (unit === 'g') v *= 1000;
  const base = ['mcg', 'mg', 'g'].includes(unit) ? 'mg' : unit;
  if (m[4]) {
    const per = m[3] ? parseFloat(m[3]) : 1;
    v = v / (per || 1);
    return `${+v.toFixed(6)}${base}/${m[4]}`;
  }
  return `${+v.toFixed(6)}${base}`;
}

export const sameStrength = (a: string, b: string) => {
  const x = normStrength(a), y = normStrength(b);
  return x !== null && x === y;
};

/**
 * Products that do NOT go in the CD register (Schedule 5 / exempt preparations).
 * Checked in code after the reader, so a model that over-flags "CD" can't put them
 * in the register. Keep this list explicit and pharmacist-confirmed.
 *  - Oral morphine solution at ≤ 2 mg/ml (e.g. Oramorph 10mg/5ml): confirmed by
 *    the supervising pharmacist, Nov 2026. Oramorph Concentrated 20mg/ml IS registered.
 */
export function registerExemption(name: string, strength: string, form?: string | null, brand?: string | null): string | null {
  const g = genericKey(brand || name) === 'morphine' ? 'morphine' : genericKey(name);
  const st = normStrength(strength);
  const f = (form || '').toLowerCase();
  if (g === 'morphine' && st?.endsWith('mg/ml') && !/tablet|capsule|inject|ampoule/.test(f)) {
    const mgPerMl = parseFloat(st);
    if (mgPerMl <= 2) return 'Low-strength oral morphine (≤ 2 mg/ml, e.g. Oramorph 10mg/5ml): no register entry needed';
  }
  return null;
}
