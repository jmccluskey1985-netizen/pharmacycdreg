'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
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
  // Two-step sign-in: the verified authenticator to challenge, once the password is accepted.
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const needCode = async () => {
    const supabase = getSupabaseClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.nextLevel !== 'aal2' || aal.currentLevel === 'aal2') return false;
    const { data } = await supabase.auth.mfa.listFactors();
    const f = data?.totp?.find((x) => x.status === 'verified');
    if (!f) return false;
    setFactorId(f.id);
    return true;
  };

  // Coming back from Google with a problem (e.g. not a pharmacy login).
  useEffect(() => { const e = params.get('auth_error'); if (e) setError(e); }, [params]);

  async function onGoogle() {
    setError(null);
    if (DEMO) { router.push('/dashboard'); return; }
    const { error: gErr } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: 'select_account' } },
    });
    if (gErr) setError(/provider is not enabled|unsupported provider/i.test(gErr.message) ? 'Google sign-in isn’t switched on yet (Supabase → Authentication → Providers → Google).' : gErr.message);
  }

  // Remember the pharmacy email on this device (the browser's password manager keeps the password).
  useEffect(() => { try { const e = localStorage.getItem('cdreg-email'); if (e) setEmail(e); } catch {} }, []);

  // Sent back here mid-sign-in (e.g. opened the dashboard before entering the code).
  useEffect(() => {
    if (!DEMO && params.get('code') === '1') needCode().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError(null);
    try {
      const { error: vErr } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
      if (vErr) { setError('That code didn’t work. Check the time on your phone and try the newest code.'); return; }
      router.push(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

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
      try { localStorage.setItem('cdreg-email', normalizeEmail(email)); } catch {}
      if (await needCode()) return;
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

  if (factorId) {
    return (
      <div className="card w-full max-w-md p-6 sm:p-8">
        <ShieldCheck className="mb-3 h-8 w-8 text-brand" />
        <h2 className="mb-1 text-xl font-bold">Two-step sign-in</h2>
        <p className="mb-6 text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
        <form onSubmit={onCode} className="space-y-4">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <input className="input text-center text-2xl font-semibold tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
          <button className="btn-primary w-full" disabled={loading || code.replace(/\s/g, '').length < 6}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Verify</button>
          <button type="button" onClick={async () => { await getSupabaseClient().auth.signOut().catch(() => {}); setFactorId(null); setCode(''); }} className="btn-ghost w-full text-sm">Use a different account</button>
        </form>
      </div>
    );
  }

  return (
    <div className="card w-full max-w-md p-6 sm:p-8">
      <h2 className="text-xl font-bold mb-1">Pharmacy sign in</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Sign in with your pharmacy account, then enter your personal PIN.
      </p>
      <button type="button" onClick={onGoogle} className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50">
        <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continue with Google
      </button>
      <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" /></div>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {notice && <div className="rounded-lg border border-brand/40 bg-brand/10 p-3 text-sm">{notice}</div>}
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@pharmacy.ie" autoComplete="username" inputMode="email" required />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <div className="relative">
            <input id="password" name="password" type={show ? 'text' : 'password'} className="input pr-12" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
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

