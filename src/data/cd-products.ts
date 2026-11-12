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
}

const p = (key: string, cls: string, generic: string, brands: string[], form: string, unit: CdProduct['unit'], strengths: string[]): CdProduct => ({ key, class: cls, generic, brands, form, unit, strengths, schedule: 2, para: 'para 1' });

export const CD_PRODUCTS: CdProduct[] = [
  // Oxycodone
  p('oxy-caps', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyNorm', 'Shortec', 'Oxynorm'], 'capsule', 'capsules', ['5mg', '10mg', '20mg']),
  p('oxy-pr', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyContin', 'Longtec', 'Oxypro', 'Reltebon', 'Oxeltra'], 'prolonged-release tablet', 'tablets', ['5mg', '10mg', '15mg', '20mg', '30mg', '40mg', '60mg', '80mg']),
  p('oxy-liq', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyNorm liquid', 'Shortec liquid'], 'oral solution', 'ml', ['5mg/5ml']),
  p('oxy-conc', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyNorm concentrate', 'Shortec concentrate'], 'concentrated oral solution', 'ml', ['10mg/ml']),
  p('oxy-inj', 'Oxycodone', 'Oxycodone hydrochloride', ['OxyNorm injection'], 'injection', 'ampoules', ['10mg/ml', '50mg/ml']),
  p('oxynal-pr', 'Oxycodone', 'Oxycodone / naloxone', ['Targin', 'Targinact', 'Oxylan'], 'prolonged-release tablet', 'tablets', ['5mg/2.5mg', '10mg/5mg', '20mg/10mg', '40mg/20mg']),
  // Morphine
  p('mor-pr-tab', 'Morphine', 'Morphine sulfate', ['MST Continus', 'MST'], 'prolonged-release tablet', 'tablets', ['5mg', '10mg', '15mg', '30mg', '60mg', '100mg', '200mg']),
  p('mor-pr-cap', 'Morphine', 'Morphine sulfate', ['Zomorph'], 'prolonged-release capsule', 'capsules', ['10mg', '30mg', '60mg', '100mg', '200mg']),
  p('mor-tab', 'Morphine', 'Morphine sulfate', ['Sevredol'], 'tablet', 'tablets', ['10mg', '20mg']),
  p('mor-conc', 'Morphine', 'Morphine sulfate', ['Oramorph concentrated', 'Oramorph concentrate'], 'concentrated oral solution', 'ml', ['20mg/ml']),
  p('mor-inj', 'Morphine', 'Morphine sulfate', ['Morphine injection'], 'injection', 'ampoules', ['10mg/ml', '15mg/ml', '30mg/ml']),
  // Fentanyl
  p('fen-patch', 'Fentanyl', 'Fentanyl', ['Durogesic', 'Matrifen', 'Fencino', 'Mezolar', 'Victanyl'], 'transdermal patch', 'patches', ['12mcg/hr', '25mcg/hr', '37.5mcg/hr', '50mcg/hr', '75mcg/hr', '100mcg/hr']),
  p('fen-sl', 'Fentanyl', 'Fentanyl', ['Abstral'], 'sublingual tablet', 'tablets', ['100mcg', '200mcg', '300mcg', '400mcg', '600mcg', '800mcg']),
  p('fen-inj', 'Fentanyl', 'Fentanyl', ['Fentanyl injection'], 'injection', 'ampoules', ['50mcg/ml']),
  // Tapentadol
  p('tap-tab', 'Tapentadol', 'Tapentadol', ['Palexia'], 'tablet', 'tablets', ['50mg']),
  p('tap-pr', 'Tapentadol', 'Tapentadol', ['Palexia SR'], 'prolonged-release tablet', 'tablets', ['25mg', '50mg', '100mg', '150mg', '200mg', '250mg']),
  p('tap-liq', 'Tapentadol', 'Tapentadol', ['Palexia oral solution'], 'oral solution', 'ml', ['20mg/ml']),
  // Hydromorphone
  p('hyd-cap', 'Hydromorphone', 'Hydromorphone hydrochloride', ['Palladone'], 'capsule', 'capsules', ['1.3mg', '2.6mg']),
  p('hyd-pr', 'Hydromorphone', 'Hydromorphone hydrochloride', ['Palladone SR'], 'prolonged-release capsule', 'capsules', ['2mg', '4mg', '8mg', '16mg', '24mg']),
  // Methadone
  p('met-liq', 'Methadone', 'Methadone hydrochloride', ['Physeptone', 'Methadone Martindale'], 'oral solution', 'ml', ['1mg/ml']),
  p('met-tab', 'Methadone', 'Methadone hydrochloride', ['Physeptone tablets'], 'tablet', 'tablets', ['5mg']),
  // Pethidine / diamorphine
  p('pet-inj', 'Pethidine', 'Pethidine hydrochloride', ['Pethidine injection'], 'injection', 'ampoules', ['50mg/ml']),
  p('dia-inj', 'Diamorphine', 'Diamorphine hydrochloride', ['Diamorphine injection'], 'powder for injection', 'ampoules', ['5mg', '10mg', '30mg', '100mg']),
  // Stimulants (ADHD)
  p('mph-tab', 'Methylphenidate', 'Methylphenidate hydrochloride', ['Ritalin', 'Medikinet', 'Tranquilyn'], 'tablet', 'tablets', ['5mg', '10mg', '20mg']),
  p('mph-concerta', 'Methylphenidate', 'Methylphenidate hydrochloride', ['Concerta XL', 'Concerta', 'Xaggitin XL', 'Delmosart'], 'prolonged-release tablet', 'tablets', ['18mg', '27mg', '36mg', '54mg']),
  p('mph-la', 'Methylphenidate', 'Methylphenidate hydrochloride', ['Ritalin LA', 'Medikinet XL', 'Equasym XL'], 'modified-release capsule', 'capsules', ['5mg', '10mg', '20mg', '30mg', '40mg', '50mg', '60mg']),
  p('lis-cap', 'Lisdexamfetamine', 'Lisdexamfetamine dimesylate', ['Elvanse', 'Tyvense'], 'capsule', 'capsules', ['20mg', '30mg', '40mg', '50mg', '60mg', '70mg']),
  p('dex-tab', 'Dexamfetamine', 'Dexamfetamine sulfate', ['Amfexa', 'Dexamfetamine'], 'tablet', 'tablets', ['5mg', '10mg', '20mg']),
  // Other
  p('ket-inj', 'Ketamine', 'Ketamine', ['Ketalar'], 'injection', 'vials', ['10mg/ml', '50mg/ml', '100mg/ml']),
];

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
