import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Revoke a link straight away.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const { data } = await db.from('inspector_links').update({ revoked_at: new Date().toISOString() }).eq('id', params.id).eq('pharmacy_id', account.pharmacyId).is('revoked_at', null).select('label').maybeSingle();
    if (!data) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    await audit(account.pharmacyId, 'inspector_link.revoked', staff, account.authUserId, { label: data.label }, { table: 'inspector_links', id: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
