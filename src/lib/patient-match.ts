/**
 * Patient matching (docs/PATIENT_MATCHING.md): score existing patients against the person on a
 * prescription, so the pharmacist picks one instead of a duplicate being made by a different
 * spelling of a name or address. Pure functions only, no database calls; the API fetches the
 * candidate pool and passes it in.
 */

export interface MatchPatient {
  id: string;
  first_name: string;
  surname: string;
  date_of_birth: string | null;
  address: string | null;
  eircode?: string | null;
  gms_number?: string | null;
  dps_number?: string | null;
  lti_number?: string | null;
  hospital_mrn?: string | null;
  [k: string]: unknown;
}

export interface PatientProbe {
  first_name?: string | null;
  surname?: string | null;
  full_name?: string | null;
  dob?: string | null; // YYYY-MM-DD
  address?: string | null;
  eircode?: string | null;
  gms?: string | null;
  dps?: string | null;
  lti?: string | null;
  mrn?: string | null;
}

export type MatchLevel = 'certain' | 'strong' | 'possible';
export interface PatientCandidate<P extends MatchPatient = MatchPatient> { patient: P; level: MatchLevel; score: number; reasons: string[]; conflicts: string[] }

/* ───────────── Normalising ───────────── */

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Lower case, no accents, no apostrophes / full stops / hyphens, single spaces. */
export function normName(s: string | null | undefined): string {
  if (!s) return '';
  return stripAccents(s).toLowerCase().replace(/[’'`.\-]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The surname key stored in patients.name_key: O'Brien / O Brien / OBrien → "obrien". */
export function nameKey(surname: string | null | undefined): string {
  return normName(surname).replace(/\s+/g, '');
}

const firstGiven = (first: string | null | undefined) => normName(first).split(' ')[0] ?? '';

/** Irish eircode, upper case without the space, from a field or pulled out of an address. */
export function extractEircode(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.toUpperCase().match(/\b([AC-FHKNPRTV-Y]\d{2}|D6W)\s?([0-9AC-FHKNPRTV-Y]{4})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

/** Card / MRN numbers: upper case, no spaces or punctuation. */
export const normCard = (s: string | null | undefined) => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') || null : null);
const gmsBase = (s: string) => s.replace(/[A-Z]+$/, '');

const ABBR: Record<string, string> = { st: 'street', rd: 'road', ave: 'avenue', av: 'avenue', co: 'county', apt: 'apartment', pk: 'park', sq: 'square', ct: 'court', cres: 'crescent', dr: 'drive', tce: 'terrace', grn: 'green', hts: 'heights', lwr: 'lower', upr: 'upper', nth: 'north', sth: 'south' };
const ADDR_STOP = new Set(['county', 'ireland', 'the']);

/** House number and the remaining words of an address (eircode removed, abbreviations expanded). */
export function normAddress(s: string | null | undefined): { house: string | null; words: Set<string> } | null {
  if (!s) return null;
  let t = stripAccents(s).toUpperCase();
  const ec = t.match(/\b([AC-FHKNPRTV-Y]\d{2}|D6W)\s?([0-9AC-FHKNPRTV-Y]{4})\b/);
  if (ec) t = t.replace(ec[0], ' ');
  const toks = t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map((w) => ABBR[w] ?? w);
  const house = toks.find((w) => /^\d+[a-z]?$/.test(w)) ?? null;
  const words = new Set(toks.filter((w) => w !== house && !ADDR_STOP.has(w)));
  return words.size || house ? { house, words } : null;
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normAddress(a), y = normAddress(b);
  if (!x || !y) return false;
  if ((x.house || y.house) && x.house !== y.house) return false;
  const inter = Array.from(x.words).filter((w) => y.words.has(w)).length;
  const union = new Set([...Array.from(x.words), ...Array.from(y.words)]).size;
  return union > 0 && inter / union >= 0.6;
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/* Short forms of first names: a match on these only ever counts as "possible" on its own. */
const NICK_GROUPS = [
  ['kate', 'katie', 'kathy', 'katherine', 'catherine', 'cathy', 'kathleen', 'caitriona', 'cait'],
  ['liz', 'lizzie', 'beth', 'betty', 'elizabeth', 'eliza'],
  ['jim', 'jimmy', 'james', 'seamus', 'jamie'],
  ['sean', 'john', 'johnny', 'jack', 'eoin'],
  ['pat', 'paddy', 'patrick', 'padraig', 'patricia', 'trish'],
  ['tom', 'tommy', 'thomas', 'tomas'],
  ['bill', 'billy', 'will', 'liam', 'william'],
  ['peggy', 'maggie', 'meg', 'margaret', 'mairead'],
  ['mick', 'mike', 'mickey', 'michael', 'micheal'],
  ['tadhg', 'tim', 'timmy', 'timothy'],
  ['dan', 'danny', 'daniel', 'donal'],
  ['joe', 'joseph', 'seosamh'],
  ['bob', 'rob', 'robbie', 'robert'],
  ['tony', 'anthony'],
  ['ger', 'gerry', 'gerard', 'gerald'],
  ['noel', 'nollaig'],
  ['annie', 'anne', 'ann', 'aine'],
  ['bridget', 'bridie', 'brigid', 'breda', 'bríd', 'brid'],
  ['nora', 'norah', 'noreen', 'honora'],
];
const NICK = new Map<string, number>();
NICK_GROUPS.forEach((g, i) => g.forEach((n) => NICK.set(stripAccents(n), i)));
const shortFormMatch = (a: string, b: string) =>
  !!a && !!b && a !== b && ((NICK.has(a) && NICK.get(a) === NICK.get(b)) || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b)));

/* ───────────── Reading the name on the script ───────────── */

const SURNAME_PREFIXES = new Set(['o', 'mc', 'mac', 'ni', 'nic', 'ui', 'ua', 'de', 'du', 'van', 'von', 'le', 'la', 'fitz']);

/** Possible (first, surname) readings of the probe: as given, SURNAME, FIRST, and both word orders. */
function nameReadings(p: PatientProbe): { first: string; sur: string }[] {
  const out: { first: string; sur: string }[] = [];
  const add = (first: string, sur: string) => { if (sur || first) out.push({ first: firstGiven(first), sur: nameKey(sur) }); };
  if (p.first_name || p.surname) { add(p.first_name ?? '', p.surname ?? ''); add(p.surname ?? '', p.first_name ?? ''); }
  const full = (p.full_name ?? '').trim();
  if (full) {
    if (full.includes(',')) { const [s, f] = full.split(',', 2); add(f, s); }
    const toks = full.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    if (toks.length >= 2) {
      // Last word(s) as surname, keeping O / Mc / Ní ... prefixes with it
      let k = toks.length - 1;
      if (k >= 1 && SURNAME_PREFIXES.has(normName(toks[k - 1]))) k -= 1;
      add(toks.slice(0, k).join(' '), toks.slice(k).join(' '));
      // First word(s) as surname (hospital pads print SURNAME first)
      let j = 1;
      if (SURNAME_PREFIXES.has(normName(toks[0])) && toks.length > 2) j = 2;
      add(toks.slice(j).join(' '), toks.slice(0, j).join(' '));
    } else add('', full);
  }
  return out;
}

/* ───────────── Scoring ───────────── */

function swappedDob(a: string, b: string) {
  const [ya, ma, da] = a.split('-'), [yb, mb, db] = b.split('-');
  return ya === yb && ma === db && da === mb && a !== b;
}

export function scorePatient<P extends MatchPatient>(probe: PatientProbe, p: P): PatientCandidate<P> | null {
  const sk = nameKey(p.surname), fg = firstGiven(p.first_name);
  let best: { exact: boolean; close: boolean; nick: boolean; surEq: boolean; diffFirst: boolean; closeSur: boolean } | null = null;
  for (const r of nameReadings(probe)) {
    if (!r.sur) continue;
    const surEq = r.sur === sk;
    const maxEdit = Math.max(r.sur.length, sk.length) >= 8 ? 2 : 1;
    const closeSur = !surEq && !!sk && editDistance(r.sur, sk) <= maxEdit;
    const firstEq = !!r.first && r.first === fg;
    const nick = shortFormMatch(r.first, fg);
    const cand = {
      exact: surEq && firstEq,
      close: (closeSur && (firstEq || nick)) || (surEq && nick),
      nick: surEq && nick,
      surEq,
      diffFirst: surEq && !!r.first && !!fg && !firstEq && !nick,
      closeSur: closeSur && (firstEq || nick),
    };
    const rank = (x: typeof cand) => (x.exact ? 3 : x.close ? 2 : x.surEq ? 1 : 0);
    if (!best || rank(cand) > rank(best)) best = cand;
  }

  const reasons: string[] = [];
  const conflicts: string[] = [];
  const pDob = p.date_of_birth ?? null, qDob = probe.dob ?? null;
  const dob = !!pDob && !!qDob && pDob === qDob;
  const dobSwap = !!pDob && !!qDob && swappedDob(pDob, qDob);

  // Scheme numbers
  let number = false;
  const nums: [string, string | null | undefined, string | null | undefined][] = [
    ['DPS', probe.dps, p.dps_number], ['LTI', probe.lti, p.lti_number], ['hospital MRN', probe.mrn, p.hospital_mrn],
  ];
  for (const [label, a, b] of nums) {
    const x = normCard(a), y = normCard(b);
    if (x && y) { if (x === y) { number = true; reasons.push(`${label} matches`); } else conflicts.push(`Different ${label} number`); }
  }
  const ga = normCard(probe.gms), gb = normCard(p.gms_number);
  if (ga && gb) {
    if (ga === gb) { number = true; reasons.push('GMS matches'); }
    else if (gmsBase(ga) === gmsBase(gb) && gmsBase(ga) !== ga) conflicts.push('Same medical card household, different person');
    else conflicts.push('Different GMS number');
  }

  const ea = extractEircode(probe.eircode) ?? extractEircode(probe.address), eb = extractEircode(p.eircode) ?? extractEircode(p.address);
  const eircode = !!ea && !!eb && ea === eb;
  const address = sameAddress(probe.address, p.address);

  if (dob) reasons.push('DOB matches');
  if (pDob && qDob && !dob && !number) conflicts.push(dobSwap ? 'Day and month of DOB swapped' : 'Different DOB');
  if (eircode) reasons.push('Eircode matches');
  else if (address) reasons.push('Same address');
  if (ea && eb && !eircode && !dob && !number) conflicts.push('Different eircode');

  const n = best;
  if (!n) return null;
  if (n.exact) reasons.unshift('Name matches');
  else if (n.closeSur) reasons.unshift('Surname one letter different');
  else if (n.nick) reasons.unshift('First name short form');
  else if (n.diffFirst) reasons.unshift('Different first name');

  const clean = conflicts.length === 0;
  let level: MatchLevel | null = null;
  if (n.exact && (dob || number) && clean) level = 'certain';
  else if (clean && ((n.exact && (eircode || address)) || (n.closeSur && dob && number) || (n.nick && (dob || number)))) level = 'strong';
  else if (
    n.exact ||
    (n.close && (dob || number || eircode)) ||
    (n.nick) ||
    ((n.exact || n.close || n.surEq) && dobSwap) ||
    (n.diffFirst && (address || eircode || (dob && eircode)))
  ) level = 'possible';
  if (!level) return null;

  const score = (number ? 40 : 0) + (dob ? 30 : 0) + (eircode ? 20 : 0) + (address ? 15 : 0) + (n.exact ? 20 : n.close ? 10 : 0) - 25 * conflicts.length;
  return { patient: p, level, score, reasons: Array.from(new Set(reasons)), conflicts };
}

const LEVEL_ORDER: Record<MatchLevel, number> = { certain: 0, strong: 1, possible: 2 };

/** Candidates for this probe, best first, at most `limit`. */
export function matchPatients<P extends MatchPatient>(probe: PatientProbe, pool: P[], limit = 5): PatientCandidate<P>[] {
  return pool
    .map((p) => scorePatient(probe, p))
    .filter((c): c is PatientCandidate<P> => !!c)
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.score - a.score)
    .slice(0, limit);
}

/**
 * Which candidate to preselect: the only certain/strong one. If two or more are certain/strong,
 * that's an existing duplicate, so nothing is preselected (ambiguous = true).
 */
export function preselect<P extends MatchPatient>(cands: PatientCandidate<P>[]): { pick: PatientCandidate<P> | null; ambiguous: boolean } {
  const top = cands.filter((c) => c.level !== 'possible');
  if (top.length === 1) return { pick: top[0], ambiguous: false };
  return { pick: null, ambiguous: top.length > 1 };
}

/** Values to store alongside a patient so the database query can find candidates quickly. */
export function patientKeys(p: { surname?: string | null; address?: string | null; eircode?: string | null }) {
  return { name_key: nameKey(p.surname) || null, eircode: extractEircode(p.eircode) ?? extractEircode(p.address) };
}
