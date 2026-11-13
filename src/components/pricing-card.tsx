import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import { PLAN, PLAN_FEATURES, FREE_TRIAL_DAYS, formatEuro } from '@/config/pricing';

export function PricingCard({ cta = true }: { cta?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-dark to-brand-deep p-6 text-white shadow-soft sm:p-8">
      {PLAN.launchOffer && (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-bold uppercase tracking-wide">
          <Sparkles className="h-3.5 w-3.5" /> Launch offer
        </span>
      )}
      <p className="text-sm font-semibold uppercase tracking-widest text-white/70">PharmacyCDReg</p>
      <div className="mt-3 flex items-end gap-3">
        <span className="text-5xl font-extrabold tabular-nums">{formatEuro(PLAN.price)}</span>
        <div className="pb-1.5">
          {PLAN.originalPrice && <span className="block text-lg text-white/60 line-through">{formatEuro(PLAN.originalPrice)}</span>}
          <span className="text-sm text-white/80">per pharmacy / {PLAN.period} + VAT</span>
        </div>
      </div>
      <p className="mt-2 inline-block rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold">
        First {FREE_TRIAL_DAYS === 30 ? 'month' : `${FREE_TRIAL_DAYS} days`} free · then {formatEuro(PLAN.price)}/{PLAN.period} · cancel any time
      </p>
      {PLAN.launchOffer && <p className="mt-2 text-xs text-white/70">Limited-time launch price — lock in {formatEuro(PLAN.price)}/{PLAN.period} while it lasts.</p>}
      <ul className="mt-5 space-y-2">
        {PLAN_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" /> {f}</li>
        ))}
      </ul>
      {cta && <Link href="/start" className="btn mt-6 w-full bg-brand text-base font-semibold text-white hover:bg-brand/90">Start your free month</Link>}
      <p className="mt-3 text-center text-xs text-white/60">No card needed · 30 days free · subscribe when you’re ready</p>
    </div>
  );
}
