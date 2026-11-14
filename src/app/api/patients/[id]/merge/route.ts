import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { writePatient, type Patient } from '@/lib/patients';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const Body = z.object({ into: z.string().uuid() });
const FIELDS = ['date_of_birth', 'address', 'phone', 'gms_number', 'dps_number', 'lti_number', 'hospital_mrn', 'eircode', 'ihi_number', 'gp_name', 'gp_address'];

/**
 * Merge a duplicate patient (:id) into the record to keep (into). Register lines keep their own
 * name and address text; only the link to the patient record moves. Pharmacists only; audited.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success || parsed.data.into === params.id) return NextResponse.json({ error: 'Choose the record to keep' }, { status: 400 });
    const db = createServiceClient();
    const { data: both } = await db.from('patients').select('*').eq('pharmacy_id', account.pharmacyId).eq('is_active', true).in('id', [params.id, parsed.data.into]);
    const from = (both ?? []).find((p) => p.id === params.id) as Patient | undefined;
    const into = (both ?? []).find((p) => p.id === parsed.data.into) as Patient | undefined;
    if (!from || !into) return NextResponse.json({ error: 'Both patients must be active records of this pharmacy' }, { status: 404 });

    // 1. Register links (the lines themselves are append-only; only the patient link is a reference column)
    const { data: lines } = await db.from('cd_entries').select('id').eq('patient_id', from.id);
    let moved = 0;
    if (lines?.length) {
      const { error } = await db.rpc('merge_patient_links', { from_id: from.id, into_id: into.id });
      if (error) return NextResponse.json({ error: 'Merging needs a one-off database update first (run migration 0016 in Supabase).' }, { status: 409 });
      moved = lines.length;
    }
    // 2. Dispensing reminders keep patient ids inside their lines
    const { data: rems } = await db.from('dispense_reminders').select('id, lines').eq('pharmacy_id', account.pharmacyId);
    for (const r of rems ?? []) {
      const ls = (r.lines ?? []) as any[];
      if (!ls.some((l) => l.patient_id === from.id)) continue;
      await db.from('dispense_reminders').update({ lines: ls.map((l) => (l.patient_id === from.id ? { ...l, patient_id: into.id } : l)) }).eq('id', r.id);
    }
    // 3. Fill blanks on the kept record, then retire the duplicate
    const fill: Record<string, unknown> = {};
    for (const k of FIELDS) if ((into[k] == null || into[k] === '') && from[k] != null && from[k] !== '') fill[k] = from[k];
    if (Object.keys(fill).length) await writePatient(db, { ...fill, surname: into.surname, updated_at: new Date().toISOString() }, into.id);
    const { error: mErr } = await db.from('patients').update({ is_active: false, merged_into: into.id, updated_at: new Date().toISOString() }).eq('id', from.id);
    if (mErr) await db.from('patients').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', from.id);
    await audit(account.pharmacyId, 'patient.merged', staff, account.authUserId, { from: from.id, into: into.id, lines_moved: moved, filled: Object.keys(fill) }, { table: 'patients', id: into.id });
    return NextResponse.json({ ok: true, lines_moved: moved });
  } catch (err) {
    return errorResponse(err);
  }
}
