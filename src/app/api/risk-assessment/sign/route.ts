import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isLead } from '@/lib/roles';

export const dynamic = 'force-dynamic';
const ROLE: Record<string, string> = { superintendent_pharmacist: 'Superintendent pharmacist', supervising_pharmacist: 'Supervising pharmacist' };

/**
 * Sign the risk assessment: the superintendent or supervising pharmacist, already identified by
 * their own PIN, confirms it. The signed version (who, PSI number, when, exactly what was signed)
 * can never be changed; a later review starts a new version.
 */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff((r) => isLead(r), { write: true });
    const body = await req.json().catch(() => null);
    if (!body?.data || typeof body.data !== 'object' || body.confirm !== true) return NextResponse.json({ error: 'Tick to confirm you have reviewed it' }, { status: 400 });
    const db = createServiceClient();
    const signedAt = new Date().toISOString();
    const signer = { signed_by_staff_id: staff.id, signed_by_name: staff.full_name, signed_by_psi: staff.psi_number ?? null, signed_by_role: ROLE[staff.role] ?? staff.role, signed_at: signedAt };
    const { data: draft } = await db.from('risk_assessments').select('id').eq('pharmacy_id', account.pharmacyId).eq('status', 'draft').maybeSingle();
    const { data: row, error } = draft
      ? await db.from('risk_assessments').update({ data: body.data, status: 'signed', updated_at: signedAt, ...signer }).eq('id', draft.id).select('id').single()
      : await db.from('risk_assessments').insert({ pharmacy_id: account.pharmacyId, data: body.data, status: 'signed', ...signer }).select('id').single();
    if (error || !row) throw error ?? new Error('Could not sign');
    await audit(account.pharmacyId, 'risk_assessment.signed', staff, account.authUserId, { version_id: row.id }, { table: 'risk_assessments', id: row.id });
    return NextResponse.json({ ok: true, id: row.id, ...signer });
  } catch (err) {
    return errorResponse(err);
  }
}
