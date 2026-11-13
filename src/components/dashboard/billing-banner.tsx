'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, AlertTriangle, Eye, Loader2 } from 'lucide-react';
import { useStaff } from './staff-context';
import { can } from '@/lib/roles';
import { PLAN, FREE_TRIAL_DAYS, formatEuro } from '@/config/pricing';

const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

export async function startCheckout() {
  const res = await fetch('/api/billing/checkout', { method: 'POST' });
  const d = await res.json().catch(() => ({}));
  if (d.url) window.location.href = d.url;
  else alert(d.error || 'Could not start checkout');
}

// Never locks the register. Shows: start trial → trial countdown → payment issue → read-only.
export async function startFreeMonth() {
  const res = await fetch('/api/billing/start-trial', { method: 'POST' });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) alert(d.error || 'Could not start the free month');
}

export function BillingBanner() {
  const { pharmacy, staff, refresh } = useStaff();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  if (!pharmacy || !staff || path.startsWith('/dashboard/billing')) return null;
  const s = pharmacy.subscription_status;
  const manager = can.manageStaff(staff.role);
  const go = async () => { setBusy(true); await startCheckout(); setBusy(false); };

  if (!s) {
    return (
      <div className="no-print mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-brand-dark to-brand-deep p-5 text-white sm:flex-row sm:items-center">
        <Sparkles className="h-6 w-6 flex-shrink-0 text-brand" />
        <div className="flex-1">
          <p className="font-semibold">Start your free month to begin recording</p>
          <p className="text-sm text-white/75">No card needed · then {formatEuro(PLAN.price)}/month{PLAN.originalPrice ? <> (<s>{formatEuro(PLAN.originalPrice)}</s> launch price)</> : null} if you subscribe</p>
        </div>
        {manager ? (
          <button onClick={async () => { setBusy(true); await startFreeMonth(); await refresh(); setBusy(false); }} disabled={busy} className="btn bg-brand font-semibold text-white hover:bg-brand/90">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Start {FREE_TRIAL_DAYS}-day free month</button>
        ) : <p className="text-sm text-white/75">Ask your supervising pharmacist to start it.</p>}
      </div>
    );
  }
  // Free month with no card yet: always show the countdown with a Subscribe button.
  if (s === 'trialing' && pharmacy.trial_ends_at && !pharmacy.has_subscription) {
    const d = Math.max(0, daysUntil(pharmacy.trial_ends_at));
    const urgent = d <= 7;
    return (
      <div className={`no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm ${urgent ? 'bg-gradient-to-r from-brand-dark to-brand-deep text-white' : 'border border-brand/40 bg-brand/10'}`}>
        <Sparkles className={`h-4 w-4 ${urgent ? 'text-brand' : 'text-brand'}`} />
        <span className="flex-1">
          Free month: <b>{d === 0 ? 'ends today' : `${d} day${d === 1 ? '' : 's'} left`}</b>
          {' '}· then {formatEuro(PLAN.price)}/month{PLAN.originalPrice ? <> (launch price, normally {formatEuro(PLAN.originalPrice)})</> : null}.
          {' '}{urgent ? 'Subscribe to keep recording after it ends.' : 'Subscribe any time: you won’t be charged until the free month ends.'}
        </span>
        {manager ? <button onClick={go} disabled={busy} className={`btn py-1.5 font-semibold ${urgent ? 'bg-brand text-white hover:bg-brand/90' : 'btn-primary'}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Subscribe</button>
          : <span className={urgent ? 'text-white/75' : 'text-muted-foreground'}>Ask your supervising pharmacist to subscribe.</span>}
      </div>
    );
  }
  if (s === 'trial_ended') {
    return (
      <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm">
        <Eye className="h-4 w-4" />
        <span className="flex-1"><b>Your free month has ended.</b> The register is read-only: you can still view, search, print and export it. Subscribe to keep recording; everything you entered is kept.</span>
        {manager && <button onClick={go} disabled={busy} className="btn-primary py-2 text-sm">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Subscribe</button>}
      </div>
    );
  }
  if (s === 'trialing' && pharmacy.trial_ends_at) {
    const d = daysUntil(pharmacy.trial_ends_at);
    if (d > 7 && !pharmacy.cancel_at_period_end) return null;
    return (
      <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm">
        <Sparkles className="h-4 w-4 text-brand" />
        <span className="flex-1">
          {pharmacy.cancel_at_period_end
            ? <>Your free month ends in <b>{d} day{d === 1 ? '' : 's'}</b> and won&apos;t renew. Your register will become read-only.</>
            : <>Free month: <b>{d} day{d === 1 ? '' : 's'} left</b>. Then {formatEuro(PLAN.price)}/month: nothing to do if you&apos;re staying.</>}
        </span>
        {manager && <Link href="/dashboard/billing" className="font-semibold text-primary underline-offset-2 hover:underline">Billing</Link>}
      </div>
    );
  }
  if (s === 'past_due') {
    return (
      <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <AlertTriangle className="h-4 w-4" />
        <span className="flex-1">Your last payment didn&apos;t go through. Update your card to avoid the register becoming read-only.</span>
        {manager && <Link href="/dashboard/billing" className="font-semibold underline">Update card</Link>}
      </div>
    );
  }
  if (s !== 'trialing' && s !== 'active' && s !== 'complimentary') {
    return (
      <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm">
        <Eye className="h-4 w-4" />
        <span className="flex-1"><b>Read-only.</b> Your subscription has ended. You can still view, search, print and export your register for inspection. Reactivate to record new entries.</span>
        {manager && <button onClick={go} disabled={busy} className="btn-primary py-2 text-sm">Reactivate</button>}
      </div>
    );
  }
  return null;
}
