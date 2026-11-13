import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { FREE_TRIAL_DAYS } from '@/config/pricing';
import { can } from '@/lib/roles';

// Start the free month without a card (for a pharmacy that hasn't had one). Once only.
export async function POST() {
  try {
    const { account, staff } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const { data: ph } = await db.from('pharmacies').select('subscription_status, trial_ends_at').eq('id', account.pharmacyId).single();
    if (ph?.subscription_status || ph?.trial_ends_at) return NextResponse.json({ error: 'The free month has already been used, subscribe from Billing.' }, { status: 409 });
    const ends = new Date(Date.now() + FREE_TRIAL_DAYS * 864e5).toISOString();
    await db.from('pharmacies').update({ subscription_status: 'trialing', trial_ends_at: ends }).eq('id', account.pharmacyId);
    await audit(account.pharmacyId, 'billing.free_month_started', staff, account.authUserId, { ends });
    return NextResponse.json({ ok: true, trial_ends_at: ends });
  } catch (err) {
    return errorResponse(err);
  }
}
