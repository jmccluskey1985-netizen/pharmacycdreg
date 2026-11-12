import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Patient {
  id: string; first_name: string; surname: string; date_of_birth: string | null; address: string | null; phone: string | null;
  gms_number: string | null; ihi_number: string | null; gp_name: string | null; gp_address: string | null; notes: string | null;
}
export const fullName = (p: Pick<Patient, 'first_name' | 'surname'>) => `${p.first_name} ${p.surname}`.trim();

/** "Mary Anne O'Brien" → first "Mary Anne", surname "O'Brien" (same split as PharmacyConsultation.ie). */
export function splitName(name: string): { first_name: string; surname: string } {
  const t = name.trim().replace(/\s+/g, ' ');
  const i = t.lastIndexOf(' ');
  return i < 0 ? { first_name: t, surname: '' } : { first_name: t.slice(0, i), surname: t.slice(i + 1) };
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
    for (const w of t.split(/\s+/).filter(Boolean).slice(0, 4)) query = query.or(`first_name.ilike.%${esc(w)}%,surname.ilike.%${esc(w)}%`);
  }
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as Patient[];
}

/** Find this patient by name+address, or create them (used when a supply is saved without picking a record). */
export async function findOrCreatePatient(db: SupabaseClient, pharmacyId: string, name: string, address: string | null, gp?: { name: string | null; address: string | null }): Promise<string | null> {
  const { first_name, surname } = splitName(name);
  let q = db.from('patients').select('id').eq('pharmacy_id', pharmacyId).eq('is_active', true).ilike('first_name', esc(first_name)).ilike('surname', esc(surname)).limit(1);
  if (address) q = q.ilike('address', esc(address));
  const { data, error } = await q;
  if (error) return null; // table not created yet
  if (data?.length) return data[0].id;
  const ins = await db.from('patients').insert({ pharmacy_id: pharmacyId, first_name, surname, address, gp_name: gp?.name ?? null, gp_address: gp?.address ?? null }).select('id').single();
  return ins.data?.id ?? null;
}

export const PatientBody = z.object({
  first_name: z.string().trim().min(1).max(80),
  surname: z.string().trim().max(80).default(''),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  gms_number: z.string().trim().max(20).nullable().optional(),
  ihi_number: z.string().trim().max(20).nullable().optional(),
  gp_name: z.string().trim().max(160).nullable().optional(),
  gp_address: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
