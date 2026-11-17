import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit, pharmacyPermissions } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { cleanOverrides } from '@/lib/permissions';
import { can } from '@/lib/roles';

/** Settings → Roles & permissions: superintendent / supervising pharmacist only. */
export async function GET() {
  try {
    const { account } = await requireStaff(can.manageStaff);
    return NextResponse.json({ permissions: await pharmacyPermissions(account.pharmacyId) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.manageStaff, { write: true });
    const next = cleanOverrides((await req.json().catch(() => ({})))?.permissions);
    const before = await pharmacyPermissions(account.pharmacyId);
    const { error } = await createServiceClient().from('pharmacies').update({ permissions: next }).eq('id', account.pharmacyId);
    if (error) {
      if (/permissions/.test(error.message)) return NextResponse.json({ error: 'Roles & permissions need a one-off database update (migration 0024).' }, { status: 503 });
      throw error;
    }
    await audit(account.pharmacyId, 'settings.permissions_changed', staff, account.authUserId, { before, after: next });
    return NextResponse.json({ permissions: next });
  } catch (err) {
    return errorResponse(err);
  }
}
