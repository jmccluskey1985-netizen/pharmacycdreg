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
  // Resolve via Stripe's object graph first (subscription, then customer); metadata only as a fallback
  const known = await pharmacyFor({ subscription: sub.id, customer: patch.stripe_customer_id ?? null, metadataPharmacyId: pharmacyId ?? null });
  const target = known?.id ?? pharmacyId;
  if (!target) return;
  const q = db.from('pharmacies').update(patch).eq('id', target);
  const { error } = await q;
  if (error) throw error;
  {
    await db.from('audit_log').insert({ pharmacy_id: target, action: 'billing.status', details: { status: patch.subscription_status, trial_ends_at: patch.trial_ends_at, cancel_at_period_end: patch.cancel_at_period_end } });
  }
}

/**
 * Which pharmacy a Stripe object belongs to, through Stripe's object graph: the subscription id,
 * else the customer id we stored, else (only as a fallback) the pharmacy_id metadata.
 */
async function pharmacyFor(ref: { subscription?: string | null; customer?: string | null; metadataPharmacyId?: string | null }) {
  const db = createServiceClient();
  const cols = 'id, name, billing_email';
  if (ref.subscription) { const { data } = await db.from('pharmacies').select(cols).eq('subscription_id', ref.subscription).maybeSingle(); if (data) return data; }
  if (ref.customer) { const { data } = await db.from('pharmacies').select(cols).eq('stripe_customer_id', ref.customer).maybeSingle(); if (data) return data; }
  if (ref.metadataPharmacyId) { const { data } = await db.from('pharmacies').select(cols).eq('id', ref.metadataPharmacyId).maybeSingle(); if (data) return data; }
  return null;
}
const idOf = (x: unknown) => (typeof x === 'string' ? x : (x as any)?.id ?? null);
/** Subscription id on an invoice, in old and new API shapes. */
const invoiceSubscription = (inv: any) => idOf(inv?.subscription) ?? idOf(inv?.parent?.subscription_details?.subscription) ?? idOf(inv?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription) ?? null;
const euro = (cents: number | null | undefined, cur = 'eur') => (typeof cents === 'number' ? `${cur.toUpperCase() === 'EUR' ? '€' : `${cur.toUpperCase()} `}${(cents / 100).toFixed(2)}` : '-');

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
          html: `<p><b>${ph?.name ?? 'A pharmacy'}</b> started its free month (${sub.status}).</p><p>Billing email: ${s.customer_details?.email ?? '-'}<br>Subscription: ${sub.id}</p>`,
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await updateBySubscription(event.data.object);
        break;
      // Payments on each invoice: a record in the audit trail, and a heads-up when a card is declined
      case 'invoice.paid': {
        const inv = event.data.object as any;
        const ph = await pharmacyFor({ subscription: invoiceSubscription(inv), customer: idOf(inv.customer) });
        if (ph) await createServiceClient().from('audit_log').insert({ pharmacy_id: ph.id, action: 'billing.invoice_paid', details: { invoice: inv.number ?? inv.id, amount: euro(inv.amount_paid, inv.currency) } });
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as any;
        const ph = await pharmacyFor({ subscription: invoiceSubscription(inv), customer: idOf(inv.customer) });
        if (ph) {
          await createServiceClient().from('audit_log').insert({ pharmacy_id: ph.id, action: 'billing.payment_failed', details: { invoice: inv.number ?? inv.id, amount: euro(inv.amount_due, inv.currency), attempt: inv.attempt_count ?? null } });
          const to = inv.customer_email || ph.billing_email;
          const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://pharmacycdreg.ie';
          if (to) await sendEmail({ to, subject: 'PharmacyCDReg: your payment didn’t go through', html: `<p>We couldn’t take the payment of <b>${euro(inv.amount_due, inv.currency)}</b> for ${ph.name}. Stripe will try again automatically over the next few days.</p><p>Please check or update the card in <a href="${site}/dashboard/billing">Billing</a>. Your register stays fully readable and exportable whatever happens.</p>` });
        }
        await sendEmail({ to: adminEmail(), subject: `Payment failed: ${ph?.name ?? idOf(inv.customer)}`, html: `<p>Invoice ${inv.number ?? inv.id} for ${euro(inv.amount_due, inv.currency)} failed (attempt ${inv.attempt_count ?? '?'}).</p>` });
        break;
      }
      // Money at risk: tell the site owner straight away (handle in the Stripe Dashboard)
      case 'charge.dispute.created':
      case 'charge.refunded':
      case 'radar.early_fraud_warning.created': {
        const o = event.data.object as any;
        const charge = event.type === 'charge.refunded' ? o : null;
        const customer = idOf(charge?.customer) ?? null;
        const ph = customer ? await pharmacyFor({ customer }) : null;
        const what = { 'charge.dispute.created': 'A payment was disputed', 'charge.refunded': 'A payment was refunded', 'radar.early_fraud_warning.created': 'Stripe flagged a payment as possible fraud' }[event.type];
        if (ph) await createServiceClient().from('audit_log').insert({ pharmacy_id: ph.id, action: `billing.${event.type.replace(/\./g, '_')}`, details: { stripe_object: o.id, amount: euro(o.amount ?? o.amount_refunded, o.currency) } });
        await sendEmail({ to: adminEmail(), subject: `Stripe: ${what}${ph ? `: ${ph.name}` : ''}`, html: `<p>${what}. Stripe object <code>${o.id}</code>${typeof o.amount === 'number' ? `, ${euro(o.amount, o.currency)}` : ''}.</p><p>Review it in the Stripe Dashboard.</p>` });
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook]', event.type, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 }); // Stripe retries
  }
}
