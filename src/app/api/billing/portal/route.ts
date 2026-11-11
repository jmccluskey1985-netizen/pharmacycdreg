import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Stripe customer portal: update card, download invoices, cancel.
export async function POST(req: Request) {
  try {
    const { account } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const { data: ph } = await db.from('pharmacies').select('stripe_customer_id').eq('id', account.pharmacyId).single();
    if (!ph?.stripe_customer_id) return NextResponse.json({ error: 'No billing account yet — start your free month first' }, { status: 400 });
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const portal = await getStripe().billingPortal.sessions.create({ customer: ph.stripe_customer_id, return_url: `${base}/dashboard/billing` });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    return errorResponse(err);
  }
}
