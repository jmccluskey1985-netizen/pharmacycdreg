import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';
import { getStripe, mapStripeStatus, periodEndISO, tsToISO } from '@/lib/stripe';
import { sendEmail, adminEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

async function updateBySubscription(sub: any) {
  const db = createServiceClient();
  const pharmacyId = sub.metadata?.pharmacy_id;
  const patch = {
    subscription_id: sub.id,
    subscription_status: mapStripeStatus(sub.status),
    trial_ends_at: tsToISO(sub.trial_end),
    current_period_end: periodEndISO(sub),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
  };
  // trial_ends_at is kept once set so a pharmacy only ever gets one free month.
  if (!patch.trial_ends_at) delete (patch as any).trial_ends_at;
  const q = pharmacyId ? db.from('pharmacies').update(patch).eq('id', pharmacyId) : db.from('pharmacies').update(patch).eq('subscription_id', sub.id);
  const { error } = await q;
  if (error) throw error;
  if (pharmacyId) {
    await db.from('audit_log').insert({ pharmacy_id: pharmacyId, action: 'billing.status', details: { status: patch.subscription_status, trial_ends_at: patch.trial_ends_at, cancel_at_period_end: patch.cancel_at_period_end } });
  }
}

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const pharmacyId = s.metadata?.pharmacy_id;
        if (!pharmacyId || !s.subscription) throw new Error(`checkout ${s.id} missing pharmacy_id/subscription`);
        const sub = await getStripe().subscriptions.retrieve(s.subscription as string);
        await updateBySubscription({ ...sub, metadata: { ...sub.metadata, pharmacy_id: pharmacyId } });
        const db = createServiceClient();
        await db.from('pharmacies').update({ billing_email: s.customer_details?.email ?? undefined }).eq('id', pharmacyId);
        const { data: ph } = await db.from('pharmacies').select('name').eq('id', pharmacyId).single();
        await sendEmail({
          to: adminEmail(),
          subject: `New PharmacyCDReg trial: ${ph?.name ?? pharmacyId}`,
          html: `<p><b>${ph?.name ?? 'A pharmacy'}</b> started its free month (${sub.status}).</p><p>Billing email: ${s.customer_details?.email ?? '—'}<br>Subscription: ${sub.id}</p>`,
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await updateBySubscription(event.data.object);
        break;
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook]', event.type, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 }); // Stripe retries
  }
}
