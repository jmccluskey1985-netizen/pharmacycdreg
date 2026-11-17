import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';

/** A pharmacist turns down a draft (with a reason), or the person who drafted it withdraws it. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const { account, staff } = await requireStaff();
    const { reason } = await req.json().catch(() => ({}));
    const db = createServiceClient();
    const { data: d } = await db.from('entry_drafts').select('id, status, drafted_by_staff_id').eq('id', id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!d || d.status !== 'pending') return NextResponse.json({ error: 'This draft was already dealt with' }, { status: 409 });
    const own = d.drafted_by_staff_id === staff.id;
    if (!own && !can.record(staff.role)) return NextResponse.json({ error: 'Only a pharmacist can turn down someone else’s draft' }, { status: 403 });
    const why = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
    if (!own && why.length < 3) return NextResponse.json({ error: 'Say why it’s being turned down' }, { status: 400 });
    await db.from('entry_drafts').update({ status: 'rejected', resolved_by_staff_id: staff.id, resolved_at: new Date().toISOString(), reject_reason: why || 'Withdrawn by the person who drafted it' }).eq('id', id);
    await audit(account.pharmacyId, own ? 'entry.draft_withdrawn' : 'entry.draft_rejected', staff, account.authUserId, { reason: why || null }, { table: 'entry_drafts', id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
