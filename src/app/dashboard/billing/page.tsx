'use client';

import { useState } from 'react';
import { CreditCard, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { useStaff } from '@/components/dashboard/staff-context';
import { startCheckout, startFreeMonth } from '@/components/dashboard/billing-banner';
import { PricingCard } from '@/components/pricing-card';
import { api, ApiError } from '@/lib/api';
import { PLAN, formatEuro } from '@/config/pricing';

const LABEL: Record<string, string> = {
  trialing: 'Free month',
  active: 'Active',
  past_due: 'Payment overdue',
  canceled: 'Cancelled — read-only',
  unpaid: 'Unpaid — read-only',
  incomplete: 'Checkout not finished',
  incomplete_expired: 'Checkout expired',
  paused: 'Paused — read-only',
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

export default function BillingPage() {
  const { pharmacy, refresh } = useStaff();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pharmacy) return null;
  const s = pharmacy.subscription_status;

  async function portal() {
    setBusy(true);
    setError(null);
    try {
      const d = await api('/api/billing/portal', { method: 'POST' });
      window.location.href = d.url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open billing');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold">Billing</h1>
      {s === 'complimentary' ? (
        <div className="card flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-brand" />
          <div><p className="font-semibold">Permanent subscription</p><p className="text-sm text-muted-foreground">Full access with no charge and no end date. Nothing to manage here.</p></div>
        </div>
      ) : (s === 'trialing' && !pharmacy.has_subscription) || s === 'trial_ended' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="card">
            <h2 className="text-lg font-semibold">{s === 'trial_ended' ? 'Your free month has ended' : `Free month — ends ${fmt(pharmacy.trial_ends_at)}`}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {s === 'trial_ended'
                ? <>Subscribe to keep recording. The register stays readable meanwhile, and everything already entered is kept.</>
                : <>No card was needed to start. Subscribe now and you won&apos;t be charged until the free month ends — then it&apos;s {formatEuro(PLAN.price)}/month + VAT at the launch price. Cancel any time.</>}
            </p>
            <button onClick={async () => { setBusy(true); await startCheckout(); setBusy(false); }} disabled={busy} className="btn-brand mt-5 w-full">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Subscribe — {formatEuro(PLAN.price)}/month</button>
          </div>
          <PricingCard cta={false} />
        </div>
      ) : !s ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="card">
            <h2 className="text-lg font-semibold">Start your free month</h2>
            <p className="mt-2 text-sm text-muted-foreground">No card needed for the free month. After that it&apos;s {formatEuro(PLAN.price)}/month + VAT at the launch price. Cancel any time before then and you won&apos;t pay a cent.</p>
            <button onClick={async () => { setBusy(true); await startFreeMonth(); await refresh(); setBusy(false); }} disabled={busy} className="btn-brand mt-5 w-full">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Start free month</button>
          </div>
          <PricingCard cta={false} />
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CreditCard className="h-6 w-6 text-brand" />
              <div>
                <p className="font-semibold">{PLAN.name} · {formatEuro(PLAN.price)}/month</p>
                <p className="text-sm text-muted-foreground">{LABEL[s] ?? s}{pharmacy.cancel_at_period_end ? ' · cancels at end of period' : ''}</p>
              </div>
            </div>
            <button onClick={portal} disabled={busy} className="btn-secondary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Manage card, invoices &amp; cancel</button>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {s === 'trialing' && <div><dt className="text-muted-foreground">Free month ends</dt><dd className="font-semibold">{fmt(pharmacy.trial_ends_at)}</dd></div>}
            <div><dt className="text-muted-foreground">{pharmacy.cancel_at_period_end ? 'Access to new entries ends' : 'Next payment'}</dt><dd className="font-semibold">{fmt(pharmacy.current_period_end)}</dd></div>
          </dl>
          {['canceled', 'unpaid', 'paused', 'incomplete_expired'].includes(s) && (
            <button onClick={async () => { setBusy(true); await startCheckout(); setBusy(false); }} className="btn-primary">Reactivate subscription</button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
            If you cancel, your register is never deleted or locked. It stays read-only so you can view, print and export it for inspection and keep it for the required retention period.
          </p>
        </div>
      )}
    </div>
  );
}
