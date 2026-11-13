import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';

// Release: put stock set aside by mistake back into usable stock (with a reason). Recorded, never deleted.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const { reason } = await req.json().catch(() => ({}));
    if (!reason || String(reason).trim().length < 5) return NextResponse.json({ error: 'Say why it’s being released' }, { status: 400 });
    const db = createServiceClient();
    const { data, error } = await db.from('quarantine_items').update({ status: 'released', release_reason: String(reason).trim(), resolved_by_staff_id: staff.id, resolved_at: new Date().toISOString() })
      .eq('id', params.id).eq('pharmacy_id', account.pharmacyId).eq('status', 'awaiting').select('id').maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Not found, or already closed' }, { status: 404 });
    await audit(account.pharmacyId, 'quarantine.released', staff, account.authUserId, { reason }, { table: 'quarantine_items', id: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
