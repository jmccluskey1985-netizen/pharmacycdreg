import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true });
  }
  return _stripe;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused';

/**
 * Can this pharmacy make NEW register entries?
 * past_due keeps working during Stripe's retry window. Whatever the status,
 * the register itself stays readable, searchable and exportable — a CD register
 * must remain available for inspection and retained for 2 years.
 */
export function canWrite(status: string | null | undefined): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due';
}

export function mapStripeStatus(s: string): SubscriptionStatus {
  return (['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'].includes(s) ? s : 'canceled') as SubscriptionStatus;
}

export function tsToISO(ts: unknown): string | null {
  return typeof ts === 'number' && Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null;
}

/** Newer Stripe API versions moved current_period_end onto the line item. */
export function periodEndISO(sub: any): string | null {
  return tsToISO(sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end);
}
