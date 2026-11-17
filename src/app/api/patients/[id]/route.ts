import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';
import { PatientBody, writePatient } from '@/lib/patients';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { account } = await requireStaff('patients');
    const db = createServiceClient();
    const { data } = await db.from('patients').select('*').eq('id', params.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    return NextResponse.json({ patient: data });
  } catch (err) {
    return errorResponse(err);
  }
}

// Edit details, or archive (is_active=false). Never touches past register entries.
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { account, staff } = await requireStaff('patients');
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();
    if (body.archive === true) {
      await db.from('patients').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', params.id).eq('pharmacy_id', account.pharmacyId);
      await audit(account.pharmacyId, 'patient.archived', staff, account.authUserId, {}, { table: 'patients', id: params.id });
      return NextResponse.json({ ok: true });
    }
    const parsed = PatientBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'First name is required; check the date of birth' }, { status: 400 });
    const { data: own } = await db.from('patients').select('id').eq('id', params.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!own) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    const { data, error } = await writePatient(db, { ...parsed.data, updated_at: new Date().toISOString() }, params.id);
    if (error || !data) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    await audit(account.pharmacyId, 'patient.updated', staff, account.authUserId, { fields: Object.keys(parsed.data) }, { table: 'patients', id: params.id });
    return NextResponse.json({ patient: data });
  } catch (err) {
    return errorResponse(err);
  }
}
