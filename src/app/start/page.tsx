'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { Logo } from '@/components/logo';
import { PricingCard } from '@/components/pricing-card';
import { getSupabaseClient } from '@/lib/supabase/client';

// "Start your free month": create pharmacy + login → sign in → Stripe Checkout.
export default function StartPage() {
  const [f, setF] = useState({ pharmacy_name: '', address: '', psi_premises_number: '', contact_name: '', contact_phone: '', email: '', password: '', accept_terms: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not create your account');

      const supabase = getSupabaseClient();
      await supabase.auth.signOut().catch(() => {});
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
      if (signInErr) throw new Error('Account created — please sign in on the home page to continue.');

      const co = await fetch('/api/billing/checkout', { method: 'POST' });
      const cd = await co.json().catch(() => ({}));
      if (!co.ok || !cd.url) {
        // Account exists; let them finish billing from inside the dashboard.
        window.location.href = '/dashboard/billing';
        return;
      }
      window.location.href = cd.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/60 to-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/"><Logo size="md" /></Link>
        <Link href="/" className="btn-ghost text-sm"><ArrowLeft className="h-4 w-4" /> Sign in</Link>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:gap-12 lg:pt-6">
        <form onSubmit={submit} className="card space-y-4 sm:p-8">
          <div>
            <h1 className="text-2xl font-bold">Start your free month</h1>
            <p className="mt-1 text-sm text-muted-foreground">Set up your pharmacy in two minutes. You&apos;ll add your card on the next screen — nothing is charged for 30 days.</p>
          </div>
          {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pharmacy</legend>
            <div><label className="label" htmlFor="pn">Pharmacy name</label><input id="pn" className="input" required value={f.pharmacy_name} onChange={set('pharmacy_name')} /></div>
            <div><label className="label" htmlFor="ad">Address</label><input id="ad" className="input" required value={f.address} onChange={set('address')} autoComplete="street-address" /></div>
            <div><label className="label" htmlFor="psi">PSI pharmacy registration no. <span className="font-normal text-muted-foreground">(optional)</span></label><input id="psi" className="input" inputMode="numeric" value={f.psi_premises_number} onChange={set('psi_premises_number')} /></div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="cn">Your name</label><input id="cn" className="input" required value={f.contact_name} onChange={set('contact_name')} autoComplete="name" /></div>
              <div><label className="label" htmlFor="ph">Phone</label><input id="ph" className="input" required type="tel" value={f.contact_phone} onChange={set('contact_phone')} autoComplete="tel" /></div>
            </div>
            <div><label className="label" htmlFor="em">Email (pharmacy login)</label><input id="em" className="input" required type="email" inputMode="email" value={f.email} onChange={set('email')} autoComplete="email" /></div>
            <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input" required type="password" minLength={10} value={f.password} onChange={set('password')} autoComplete="new-password" /><p className="mt-1 text-xs text-muted-foreground">At least 10 characters. Each staff member also gets their own PIN.</p></div>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-0.5 h-5 w-5" checked={f.accept_terms} onChange={(e) => setF({ ...f, accept_terms: e.target.checked })} />
            <span>I agree to the terms of service and privacy policy, and confirm I&apos;m authorised to set this up for the pharmacy.</span>
          </label>

          <button className="btn-primary w-full text-base" disabled={busy}>
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Setting up…</> : 'Continue to free month'}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Secure card setup by Stripe · €0 today</p>
        </form>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <PricingCard cta={false} />
        </div>
      </section>
    </main>
  );
}
