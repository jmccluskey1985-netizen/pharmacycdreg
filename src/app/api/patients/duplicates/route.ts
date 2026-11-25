import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { matchPatients, nameKey, normCard } from '@/lib/patient-match';
import type { Patient } from '@/lib/patients';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/** Pairs of this pharmacy's patients that score certain/strong against each other. */
export async function GET() {
  try {
    const { account } = await requireStaff('patients');
    const db = createServiceClient();
    const { data, error } = await db.from('patients').select('*').eq('pharmacy_id', account.pharmacyId).eq('is_active', true).limit(5000);
    if (error) return NextResponse.json({ pairs: [] });
    const all = (data ?? []) as Patient[];
    const pairs: { a: Patient; b: Patient; level: string; reasons: string[] }[] = [];
    const seen = new Set<string>();
    // Only compare records that share something (surname start, DOB, eircode or a card number).
    const buckets = new Map<string, Patient[]>();
    const put = (k: string | null | undefined, p: Patient) => { if (!k) return; const l = buckets.get(k); if (l) l.push(p); else buckets.set(k, [p]); };
    for (const p of all) {
      const nk = p.name_key || nameKey(p.surname);
      put(nk && `n:${nk.slice(0, 3)}`, p);
      put(p.date_of_birth && `d:${p.date_of_birth}`, p);
      put(p.eircode && `e:${p.eircode}`, p);
      for (const c of ['gms_number', 'dps_number', 'lti_number', 'hospital_mrn']) put(normCard(p[c] as string) && `${c}:${normCard(p[c] as string)!.replace(/[A-Z]$/, '')}`, p);
    }
    const others = new Map<string, Map<string, Patient>>();
    for (const list of Array.from(buckets.values())) {
      if (list.length < 2 || list.length > 400) continue;
      for (const a of list) { let m = others.get(a.id); if (!m) others.set(a.id, (m = new Map())); for (const b of list) if (b.id !== a.id) m.set(b.id, b); }
    }
    for (const a of all) {
      const pool = Array.from(others.get(a.id)?.values() ?? []);
      if (!pool.length) continue;
      for (const c of matchPatients({ first_name: a.first_name, surname: a.surname, dob: a.date_of_birth, address: a.address, eircode: a.eircode, gms: a.gms_number, dps: a.dps_number, lti: a.lti_number, mrn: a.hospital_mrn }, pool, 3)) {
        // Possible pairs are left out, except a name one letter different at the same address: worth a look.
        const typo = c.reasons.some((r) => r.includes('one letter different')) && c.reasons.some((r) => r === 'Same address' || r === 'Eircode matches') && !c.conflicts.length;
        if (c.level === 'possible' && !typo) continue;
        const key = [a.id, c.patient.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ a, b: c.patient, level: c.level, reasons: c.reasons });
      }
    }
    return NextResponse.json({ pairs: pairs.slice(0, 200) });
  } catch (err) {
    return errorResponse(err);
  }
}
