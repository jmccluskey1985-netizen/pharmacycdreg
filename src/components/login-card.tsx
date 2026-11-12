'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { DEMO } from '@/lib/demo/flag';

// Same normalisation as PharmacyConsultation.ie (googlemail → gmail, trim, lower).
const normalizeEmail = (e: string) => e.toLowerCase().trim().replace(/@googlemail\.com$/, '@gmail.com');

export function LoginCard() {
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
    if (DEMO) {
      await fetch('/api/staff/lock', { method: 'POST' });
      router.push('/dashboard');
      return;
    }
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
        Sign in with your pharmacy account, then enter your personal PIN.
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

