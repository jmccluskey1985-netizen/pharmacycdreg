import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { searchPatients, PatientBody } from '@/lib/patients';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';


const NEEDS_MIGRATION = 'Patient records need a one-off database update first (run migration 0008 in Supabase).';

export async function GET(req: Request) {
  try {
    const { account } = await requireStaff(can.record);
    const q = new URL(req.url).searchParams.get('q') || '';
    const db = createServiceClient();
    const { error } = await db.from('patients').select('id', { head: true, count: 'exact' }).eq('pharmacy_id', account.pharmacyId);
    if (error) return NextResponse.json({ patients: [], needs_migration: true });
    return NextResponse.json({ patients: await searchPatients(db, account.pharmacyId, q, q ? 30 : 200) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record);
    const parsed = PatientBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'First name is required; check the date of birth' }, { status: 400 });
    const db = createServiceClient();
    const { data, error } = await db.from('patients').insert({ ...parsed.data, pharmacy_id: account.pharmacyId }).select('*').single();
    if (error) return NextResponse.json({ error: /relation|does not exist/i.test(error.message) ? NEEDS_MIGRATION : 'Could not save the patient' }, { status: 409 });
    await audit(account.pharmacyId, 'patient.created', staff, account.authUserId, {}, { table: 'patients', id: data.id });
    return NextResponse.json({ patient: data });
  } catch (err) {
    return errorResponse(err);
  }
}
