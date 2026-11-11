'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, ShieldCheck, ScanLine, BookOpen, Search } from 'lucide-react';
import { Logo } from '@/components/logo';
import { getSupabaseClient } from '@/lib/supabase/client';

// Same normalisation as PharmacyConsultation.ie (googlemail → gmail, trim, lower).
const normalizeEmail = (e: string) => e.toLowerCase().trim().replace(/@googlemail\.com$/, '@gmail.com');

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = getSupabaseClient();
      // Shared dispensary computers: drop any previous login and active staff member first.
      await supabase.auth.signOut().catch(() => {});
      await fetch('/api/staff/lock', { method: 'POST' }).catch(() => {});
      const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
      if (authError) {
        setError(authError.message === 'Invalid login credentials' ? 'Email or password is incorrect' : authError.message);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('Could not sign in. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function onForgot() {
    if (!email) {
      setError('Enter your email first, then tap “Forgot password?”');
      return;
    }
    setError(null);
    await getSupabaseClient().auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setNotice('If that email has an account, a reset link is on its way.');
  }

  return (
    <div className="card w-full max-w-md p-6 sm:p-8">
      <h2 className="text-xl font-bold mb-1">Pharmacy sign in</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Sign in with your pharmacy account. You&apos;ll then enter your personal PIN.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {notice && <div className="rounded-lg border border-brand/40 bg-brand/10 p-3 text-sm">{notice}</div>}
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@pharmacy.ie" autoComplete="email" inputMode="email" required />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <div className="relative">
            <input id="password" type={show ? 'text' : 'password'} className="input pr-12" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-muted-foreground hover:text-foreground" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full text-base">
          {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Signing in…</> : 'Sign in'}
        </button>
        <button type="button" onClick={onForgot} className="w-full text-sm text-primary hover:underline">Forgot password?</button>
      </form>
    </div>
  );
}

const FEATURES = [
  { icon: BookOpen, title: 'Looks like the register you know', text: 'One page per drug, same columns as the paper book — with the balance worked out for you.' },
  { icon: ScanLine, title: 'Snap the wholesaler invoice', text: 'Take a photo on your phone. CD lines and quantities are read for you to check and confirm.' },
  { icon: ShieldCheck, title: 'Nothing is ever overwritten', text: 'Corrections sit alongside the original with who, when and why — a full audit trail.' },
  { icon: Search, title: 'Inspection ready', text: 'Search by drug, date, supplier, patient or prescriber, then print or export in seconds.' },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/60 to-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo size="md" />
      </header>

      <section className="mx-auto grid max-w-6xl items-start gap-8 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-12">
        {/* Login first on phones */}
        <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
          <Suspense fallback={<div className="card h-96 w-full max-w-md" />}>
            <LoginCard />
          </Suspense>
        </div>

        <div className="order-2 lg:order-1">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-brand-dark dark:text-white sm:text-4xl">
            Your Controlled Drugs Register,<br className="hidden sm:block" /> on any device.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            Record receipts, supplies and witnessed destructions of Schedule 2 controlled drugs, with running balances and a complete audit trail. Built around the IPU eCDR requirements for Irish community pharmacies.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3 rounded-xl bg-card/70 p-4 ring-1 ring-border">
                <f.icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        PharmacyCDReg.ie is an independent service. It is not affiliated with the PSI, the HSE or the IPU.
      </footer>
    </main>
  );
}
