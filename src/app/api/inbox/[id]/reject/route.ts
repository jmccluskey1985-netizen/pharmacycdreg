import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff(can.record);
    const { reason } = await req.json().catch(() => ({}));
    if (typeof reason !== 'string' || reason.trim().length < 3) return NextResponse.json({ error: 'Give a reason' }, { status: 400 });
    const db = createServiceClient();
    const { error } = await db.from('pmr_inbox').update({ status: 'rejected', problem: reason.trim(), resolved_by_staff_id: staff.id, resolved_at: new Date().toISOString() }).eq('id', params.id).eq('pharmacy_id', account.pharmacyId).eq('status', 'pending');
    if (error) throw error;
    await audit(account.pharmacyId, 'pmr.rejected', staff, account.authUserId, { reason }, { table: 'pmr_inbox', id: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
