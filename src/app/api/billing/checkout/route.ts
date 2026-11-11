import { NextResponse } from 'next/server';
import { requireAccount, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getStripe, canWrite } from '@/lib/stripe';
import { FREE_TRIAL_DAYS } from '@/config/pricing';

export const dynamic = 'force-dynamic';

// Start the free month. Same model as PharmacyConsultation.ie:
// card required up-front, €0 today, auto-charges the launch price after 30 days
// unless cancelled. Irish VAT via Stripe Tax; VAT number captured at checkout.
export async function POST(req: Request) {
  try {
    const account = await requireAccount();
    const db = createServiceClient();
    const { data: ph } = await db.from('pharmacies').select('id, name, subscription_status, stripe_customer_id, trial_ends_at').eq('id', account.pharmacyId).single();
    if (canWrite(ph?.subscription_status)) return NextResponse.json({ error: 'Your subscription is already active' }, { status: 409 });

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return NextResponse.json({ error: 'Billing is not configured yet' }, { status: 503 });
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

    // One free month per pharmacy: a returning pharmacy re-subscribes without a trial.
    const hadTrial = !!ph?.trial_ends_at;

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(ph?.stripe_customer_id ? { customer: ph.stripe_customer_id, customer_update: { address: 'auto', name: 'auto' } } : { customer_email: account.email }),
      subscription_data: {
        ...(hadTrial ? {} : { trial_period_days: FREE_TRIAL_DAYS }),
        metadata: { pharmacy_id: account.pharmacyId },
      },
      metadata: { pharmacy_id: account.pharmacyId },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      success_url: `${base}/dashboard?billing=success`,
      cancel_url: `${base}/dashboard/billing?billing=cancelled`,
    });
    await audit(account.pharmacyId, 'billing.checkout_started', null, account.authUserId, { trial: !hadTrial });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return errorResponse(err);
  }
}
