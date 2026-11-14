import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { matchPatients, preselect, patientKeys, nameKey, normCard, extractEircode, type PatientProbe, type PatientCandidate } from './patient-match';

export interface Patient {
  id: string; first_name: string; surname: string; date_of_birth: string | null; address: string | null; phone: string | null;
  gms_number: string | null; ihi_number: string | null; gp_name: string | null; gp_address: string | null; notes: string | null;
  dps_number?: string | null; lti_number?: string | null; hospital_mrn?: string | null; eircode?: string | null; name_key?: string | null; merged_into?: string | null;
  [k: string]: unknown;
}
export const fullName = (p: Pick<Patient, 'first_name' | 'surname'>) => `${p.first_name} ${p.surname}`.trim();

const SURNAME_PREFIX = /^(o|mc|mac|ni|nic|ui|ua|de|du|van|von|le|la|fitz)$/i;

/**
 * "Mary Anne O'Brien" → first "Mary Anne", surname "O'Brien". Keeps "O Connor", "Mc Guinness",
 * "Ní Bhriain" together, and reads "KELLY, MARY" (surname first, with a comma).
 */
export function splitName(name: string): { first_name: string; surname: string } {
  const t = name.trim().replace(/\s+/g, ' ');
  if (t.includes(',')) { const [sur, first] = t.split(',', 2).map((x) => x.trim()); if (sur && first) return { first_name: first, surname: sur }; }
  const toks = t.split(' ');
  if (toks.length < 2) return { first_name: t, surname: '' };
  let k = toks.length - 1;
  if (k >= 2 && SURNAME_PREFIX.test(toks[k - 1].replace(/[.']/g, ''))) k -= 1;
  return { first_name: toks.slice(0, k).join(' '), surname: toks.slice(k).join(' ') };
}

const NEW_COLS = ['dps_number', 'lti_number', 'hospital_mrn', 'eircode', 'name_key', 'merged_into'];
const isMissingColumn = (msg?: string) => /column|schema cache/i.test(msg ?? '');

/** Insert or update a patient, keeping name_key / eircode current. Works before migration 0016 too. */
export async function writePatient(db: SupabaseClient, row: Record<string, unknown>, id?: string) {
  const withKeys: Record<string, unknown> = { ...row };
  if ('surname' in row || 'address' in row || 'eircode' in row) Object.assign(withKeys, patientKeys({ surname: row.surname as string, address: row.address as string, eircode: row.eircode as string }));
  for (const k of ['gms_number', 'dps_number', 'lti_number', 'hospital_mrn']) if (typeof withKeys[k] === 'string') withKeys[k] = normCard(withKeys[k] as string);
  const run = (r: Record<string, unknown>) => (id ? db.from('patients').update(r).eq('id', id).select('*').single() : db.from('patients').insert(r).select('*').single());
  let res = await run(withKeys);
  if (res.error && isMissingColumn(res.error.message)) {
    const legacy = Object.fromEntries(Object.entries(withKeys).filter(([k]) => !NEW_COLS.includes(k)));
    res = await run(legacy);
  }
  return res;
}

/** This pharmacy's patients who could plausibly be the person on the script (scored in matchPatients). */
export async function candidatePool(db: SupabaseClient, pharmacyId: string, probe: PatientProbe): Promise<Patient[]> {
  const parts = splitName(probe.full_name ?? `${probe.first_name ?? ''} ${probe.surname ?? ''}`);
  const keys = new Set<string>();
  for (const s of [probe.surname, parts.surname, parts.first_name.split(' ')[0], probe.first_name]) { const k = nameKey(s); if (k) keys.add(k); }
  const ors: string[] = [];
  for (const k of Array.from(keys)) { ors.push(`name_key.eq.${k}`); if (k.length >= 3) ors.push(`name_key.like.${k.slice(0, 3)}*`); }
  if (probe.dob) ors.push(`date_of_birth.eq.${probe.dob}`);
  const ec = extractEircode(probe.eircode) ?? extractEircode(probe.address);
  if (ec) ors.push(`eircode.eq.${ec}`);
  for (const [col, v] of [['gms_number', probe.gms], ['dps_number', probe.dps], ['lti_number', probe.lti], ['hospital_mrn', probe.mrn]] as const) { const c = normCard(v); if (c) ors.push(`${col}.eq.${c}`); }
  if (!ors.length) return [];
  const { data, error } = await db.from('patients').select('*').eq('pharmacy_id', pharmacyId).eq('is_active', true).is('merged_into', null).or(ors.join(',')).limit(200);
  if (!error) return (data ?? []) as Patient[];
  // Before migration 0016: fall back to surname / DOB / GMS on the original columns
  const legacy: string[] = [];
  for (const s of [probe.surname, parts.surname].filter(Boolean)) legacy.push(`surname.ilike.${esc(String(s)).replace(/[^\w ]/g, '')}*`);
  if (probe.dob) legacy.push(`date_of_birth.eq.${probe.dob}`);
  if (probe.gms) legacy.push(`gms_number.eq.${normCard(probe.gms)}`);
  if (!legacy.length) return [];
  const fb = await db.from('patients').select('*').eq('pharmacy_id', pharmacyId).eq('is_active', true).or(legacy.join(',')).limit(200);
  return (fb.data ?? []) as Patient[];
}

export async function findPatientMatches(db: SupabaseClient, pharmacyId: string, probe: PatientProbe) {
  const pool = await candidatePool(db, pharmacyId, probe);
  const candidates = matchPatients(probe, pool);
  return { candidates, ...preselect(candidates) };
}

/** What the pharmacist sees for each candidate (no more than the patients list already shows). */
export const candidateView = (c: PatientCandidate<Patient>) => ({
  id: c.patient.id, first_name: c.patient.first_name, surname: c.patient.surname, date_of_birth: c.patient.date_of_birth,
  address: c.patient.address, gms_number: c.patient.gms_number, level: c.level, reasons: c.reasons, conflicts: c.conflicts,
});

/** Fill blanks on the chosen record from the script; report fields that differ (never overwritten silently). */
export async function fillPatientGaps(db: SupabaseClient, patient: Patient, probe: PatientProbe & { gp_name?: string | null; gp_address?: string | null }) {
  const want: Record<string, string | null | undefined> = {
    date_of_birth: probe.dob, address: probe.address, gms_number: normCard(probe.gms), dps_number: normCard(probe.dps),
    lti_number: normCard(probe.lti), hospital_mrn: normCard(probe.mrn), eircode: extractEircode(probe.eircode) ?? extractEircode(probe.address),
  };
  const fill: Record<string, unknown> = {};
  const differs: { field: string; on_record: unknown; on_script: string }[] = [];
  for (const [k, v] of Object.entries(want)) {
    if (!v) continue;
    const cur = patient[k];
    if (cur === undefined) continue; // column not there yet
    if (cur == null || cur === '') fill[k] = v;
    else if (k === 'address' ? String(cur).trim().toLowerCase() !== v.trim().toLowerCase() : String(cur).toUpperCase() !== String(v).toUpperCase()) differs.push({ field: k, on_record: cur, on_script: v });
  }
  if (Object.keys(fill).length) await writePatient(db, { ...fill, ...(fill.address ? { surname: patient.surname } : {}), updated_at: new Date().toISOString() }, patient.id);
  return { filled: Object.keys(fill), differs };
}

/** Accepts "12/03/1950", "12-3-50" or "1950-03-12" → YYYY-MM-DD (Irish day-first). */
export function parseDob(q: string): string | null {
  const iso = q.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return q;
  const m = q.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += y > Number(String(new Date().getFullYear()).slice(2)) ? 1900 : 2000;
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const esc = (s: string) => s.replace(/[%_,()\\]/g, ' ');

/** Search by name (any order), DOB or GMS number. */
export async function searchPatients(db: SupabaseClient, pharmacyId: string, q: string, limit = 30): Promise<Patient[]> {
  let query = db.from('patients').select('*').eq('pharmacy_id', pharmacyId).eq('is_active', true).order('surname').order('first_name').limit(limit);
  const t = q.trim();
  const dob = t ? parseDob(t) : null;
  if (dob) query = query.eq('date_of_birth', dob);
  else if (/^\d{4,}[a-z]?$/i.test(t)) query = query.ilike('gms_number', `${esc(t)}%`);
  else if (t) {
    // Each word must match the first name, surname, or the normalised surname key
    // (so "obrien" finds O'Brien and "sean" finds Seán via the key / accent-free match).
    for (const w of t.split(/\s+/).filter(Boolean).slice(0, 4)) {
      const k = nameKey(w);
      query = query.or(`first_name.ilike.%${esc(w)}%,surname.ilike.%${esc(w)}%${k ? `,name_key.ilike.%${k}%` : ''}`);
    }
  }
  const { data, error } = await query;
  if (!error) return (data ?? []) as Patient[];
  if (!isMissingColumn(error.message) || !t) return [];
  // Before migration 0016 (no name_key): plain name search
  let fb = db.from('patients').select('*').eq('pharmacy_id', pharmacyId).eq('is_active', true).order('surname').order('first_name').limit(limit);
  for (const w of t.split(/\s+/).filter(Boolean).slice(0, 4)) fb = fb.or(`first_name.ilike.%${esc(w)}%,surname.ilike.%${esc(w)}%`);
  return ((await fb).data ?? []) as Patient[];
}

/**
 * Link a supply to a patient when nobody picked one (Halo inbox, repeats, register import).
 * Exactly one certain match → link it. Otherwise create a new record from the script's details
 * and report the best near-match, so it can be reviewed under Possible duplicates.
 */
export async function findOrCreatePatient(
  db: SupabaseClient, pharmacyId: string, name: string, address: string | null,
  gp?: { name: string | null; address: string | null }, dob?: string | null, extra: Partial<PatientProbe> = {},
): Promise<string | null> {
  const r = await resolvePatientNonInteractive(db, pharmacyId, { full_name: name, address, dob: dob ?? null, ...extra }, gp);
  return r?.id ?? null;
}

export async function resolvePatientNonInteractive(db: SupabaseClient, pharmacyId: string, probe: PatientProbe, gp?: { name: string | null; address: string | null }) {
  const { error: tableErr } = await db.from('patients').select('id', { head: true, count: 'exact' }).eq('pharmacy_id', pharmacyId);
  if (tableErr) return null; // table not created yet
  const { candidates } = await findPatientMatches(db, pharmacyId, probe);
  const certain = candidates.filter((c) => c.level === 'certain');
  if (certain.length === 1) { await fillPatientGaps(db, certain[0].patient, probe); return { id: certain[0].patient.id, created: false, possibleDuplicateOf: null }; }
  const created = await createPatientFromProbe(db, pharmacyId, probe, gp);
  return created ? { id: created.id, created: true, possibleDuplicateOf: candidates[0]?.patient.id ?? null } : null;
}

export async function createPatientFromProbe(db: SupabaseClient, pharmacyId: string, probe: PatientProbe, gp?: { name: string | null; address: string | null }) {
  const split = probe.first_name || probe.surname ? { first_name: probe.first_name ?? '', surname: probe.surname ?? '' } : splitName(probe.full_name ?? '');
  const { data } = await writePatient(db, {
    pharmacy_id: pharmacyId, first_name: split.first_name || split.surname, surname: split.first_name ? split.surname : '',
    address: probe.address ?? null, date_of_birth: probe.dob ?? null, gms_number: probe.gms ?? null, dps_number: probe.dps ?? null,
    lti_number: probe.lti ?? null, hospital_mrn: probe.mrn ?? null, eircode: probe.eircode ?? null,
    gp_name: gp?.name ?? null, gp_address: gp?.address ?? null,
  });
  return data as Patient | null;
}

export const PatientBody = z.object({
  first_name: z.string().trim().min(1).max(80),
  surname: z.string().trim().max(80).default(''),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  gms_number: z.string().trim().max(20).nullable().optional(),
  dps_number: z.string().trim().max(20).nullable().optional(),
  lti_number: z.string().trim().max(20).nullable().optional(),
  hospital_mrn: z.string().trim().max(30).nullable().optional(),
  eircode: z.string().trim().max(10).nullable().optional(),
  ihi_number: z.string().trim().max(20).nullable().optional(),
  gp_name: z.string().trim().max(160).nullable().optional(),
  gp_address: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type EntryPatientResult =
  | { kind: 'linked'; id: string; created: boolean; events: { action: string; details: Record<string, unknown> }[]; differs: { field: string; on_record: unknown; on_script: string }[] }
  | { kind: 'choose'; candidates: ReturnType<typeof candidateView>[]; pick_id: string | null }
  | { kind: 'none' };

/**
 * Which patient record a supply belongs to (docs/PATIENT_MATCHING.md §7).
 * - patient_id given → that record (must be this pharmacy's), filling blanks from the script.
 * - new_patient → a new record; if it looked like someone already there, that's audited.
 * - neither → one certain match is linked; with a person at the screen any other
 *   near-match is sent back to choose from; otherwise a new record is made and the
 *   near-match noted in the audit trail for review under Possible duplicates.
 */
export async function resolvePatientForEntry(
  db: SupabaseClient, pharmacyId: string,
  o: { patientId?: string | null; newPatient?: boolean; interactive?: boolean; update?: string[]; probe: PatientProbe; gp?: { name: string | null; address: string | null } },
): Promise<EntryPatientResult> {
  const { error: tableErr } = await db.from('patients').select('id', { head: true, count: 'exact' }).eq('pharmacy_id', pharmacyId);
  if (tableErr) return { kind: 'none' }; // before migration 0008
  const events: { action: string; details: Record<string, unknown> }[] = [];
  const link = async (p: Patient) => {
    const update = (o.update ?? []).filter((k) => ['address', 'date_of_birth', 'gms_number', 'eircode'].includes(k));
    if (update.length) {
      const src: Record<string, unknown> = { address: o.probe.address, date_of_birth: o.probe.dob, gms_number: o.probe.gms, eircode: extractEircode(o.probe.eircode) ?? extractEircode(o.probe.address) };
      const row: Record<string, unknown> = { surname: p.surname, updated_at: new Date().toISOString() };
      for (const k of update) if (src[k]) row[k] = src[k];
      if (Object.keys(row).length > 2) {
        await writePatient(db, row, p.id);
        events.push({ action: 'patient.updated_from_script', details: { patient_id: p.id, fields: Object.keys(row).filter((k) => k !== 'surname' && k !== 'updated_at') } });
        Object.assign(p, row);
      }
    }
    const { differs } = await fillPatientGaps(db, p, o.probe);
    return { kind: 'linked' as const, id: p.id, created: false, events, differs };
  };

  if (o.patientId) {
    const { data } = await db.from('patients').select('*').eq('id', o.patientId).eq('pharmacy_id', pharmacyId).maybeSingle();
    return data ? link(data as Patient) : { kind: 'none' };
  }
  const { candidates, pick } = await findPatientMatches(db, pharmacyId, o.probe);
  const close = candidates.filter((c) => c.level !== 'possible');
  if (!o.newPatient) {
    const certain = candidates.filter((c) => c.level === 'certain');
    if (certain.length === 1 && candidates.filter((c) => c.level !== 'possible').length === 1) return link(certain[0].patient);
    if (o.interactive && candidates.length) return { kind: 'choose', candidates: candidates.map(candidateView), pick_id: pick?.patient.id ?? null };
  }
  const created = await createPatientFromProbe(db, pharmacyId, o.probe, o.gp);
  if (!created) return { kind: 'none' };
  if (o.newPatient && close.length) events.push({ action: 'patient.created_despite_match', details: { patient_id: created.id, matched: close.map((c) => ({ id: c.patient.id, level: c.level })) } });
  else if (candidates.length) events.push({ action: 'patient.possible_duplicate', details: { patient_id: created.id, possible_duplicate_of: candidates[0].patient.id, level: candidates[0].level } });
  return { kind: 'linked', id: created.id, created: true, events, differs: [] };
}
