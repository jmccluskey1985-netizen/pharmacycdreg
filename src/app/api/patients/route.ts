import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { searchPatients, PatientBody, writePatient } from '@/lib/patients';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';


const NEEDS_MIGRATION = 'Patient records need a one-off database update first (run migration 0008 in Supabase).';

export async function GET(req: Request) {
  try {
    const { account } = await requireStaff('patients');
    const sp = new URL(req.url).searchParams;
    const q = sp.get('q') || '';
    const db = createServiceClient();
    const { error } = await db.from('patients').select('id', { head: true, count: 'exact' }).eq('pharmacy_id', account.pharmacyId);
    if (error) return NextResponse.json({ patients: [], needs_migration: true });
    // Opioid substitution (methadone / buprenorphine) patients of this pharmacy
    if (sp.get('ost') === '1') {
      const { data, error: e2 } = await db.from('patients').select('*').eq('pharmacy_id', account.pharmacyId).eq('is_ost', true).eq('is_active', true).order('surname').limit(500);
      return NextResponse.json({ patients: e2 ? [] : data ?? [], needs_migration: !!e2 });
    }
    return NextResponse.json({ patients: await searchPatients(db, account.pharmacyId, q, q ? 30 : 200) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff('patients');
    const parsed = PatientBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'First name is required; check the date of birth' }, { status: 400 });
    const db = createServiceClient();
    const { data, error } = await writePatient(db, { ...parsed.data, pharmacy_id: account.pharmacyId });
    if (error) return NextResponse.json({ error: /relation|does not exist/i.test(error.message) ? NEEDS_MIGRATION : 'Could not save the patient' }, { status: 409 });
    await audit(account.pharmacyId, 'patient.created', staff, account.authUserId, {}, { table: 'patients', id: data.id });
    return NextResponse.json({ patient: data });
  } catch (err) {
    return errorResponse(err);
  }
}
