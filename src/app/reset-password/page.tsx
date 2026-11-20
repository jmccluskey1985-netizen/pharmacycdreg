'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { getSupabaseClient } from '@/lib/supabase/client';

/**
 * Lands here from a password-reset email or a new-pharmacy invite (?welcome=1).
 * Our emails carry ?token_hash=…&type=recovery|invite (redeemed here with verifyOtp); older
 * Supabase links carry ?code=… or tokens after # . It's turned
 * into a session first, then the person chooses their password.
 */
export default function ResetPassword() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState<'checking' | 'ok' | 'expired'>('checking');
  const [welcome, setWelcome] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = getSupabaseClient();
    const url = new URL(window.location.href);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state (storage, URL, fetched data) read after hydration
    setWelcome(url.searchParams.get('welcome') === '1');
    (async () => {
      const hash = new URLSearchParams(url.hash.slice(1));
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type');
      if (hash.get('error_description')) { setMsg(hash.get('error_description')); setReady('expired'); return; }
      if (tokenHash && (type === 'recovery' || type === 'invite')) {
        // Our own emails: redeem the one-time token here (link scanners that open it don't use it up)
        const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) setMsg('This link has already been used or has expired.');
      } else if (hash.get('access_token') && hash.get('refresh_token')) {
        await sb.auth.setSession({ access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')! });
      } else if (code) {
        await sb.auth.exchangeCodeForSession(code).catch(() => null);
      }
      // Don't leave the one-time tokens in the address bar or history
      window.history.replaceState(null, '', url.pathname + (url.searchParams.get('welcome') ? '?welcome=1' : ''));
      const { data } = await sb.auth.getSession();
      setReady(data.session ? 'ok' : 'expired');
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setMsg('The passwords don’t match.');
    if (pw.length < 10) return setMsg('Use at least 10 characters.');
    const sb = getSupabaseClient();
    const { data: who } = await sb.auth.getUser();
    const local = (who.user?.email ?? '').split('@')[0].toLowerCase();
    if (/^(.)\1+$/.test(pw) || /^(password|pharmacy|1234567890|qwertyuiop)/i.test(pw) || (local.length >= 4 && pw.toLowerCase().includes(local))) {
      return setMsg('Choose something harder to guess: not your email, “password”, or repeated characters. A short phrase works well.');
    }
    setBusy(true); setMsg(null);
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setBusy(false); return setMsg(error.message); }
    // Sign out every other device that had the old password, and email a security notice
    await sb.auth.signOut({ scope: 'others' }).catch(() => {});
    if (!welcome) await fetch('/api/auth/password-changed', { method: 'POST' }).catch(() => {});
    setBusy(false);
    router.push('/dashboard');
  }

  return (
    <main className="theme-light flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo />
      {ready === 'checking' && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking your link…</p>}
      {ready === 'expired' && (
        <div className="card w-full max-w-sm space-y-3 text-sm">
          <h1 className="text-lg font-bold">This link has expired</h1>
          <p className="text-muted-foreground">{msg ?? 'Links work once and for a limited time.'} Use <b>Forgot password</b> on the sign-in page to get a new one, or ask for a new invite.</p>
          <Link href="/" className="btn-primary w-full">Go to sign-in</Link>
        </div>
      )}
      {ready === 'ok' && (
        <form onSubmit={save} className="card w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-lg font-bold">{welcome ? 'Welcome to PharmacyCDReg.ie' : 'Choose a new password'}</h1>
            {welcome && <p className="mt-1 text-sm text-muted-foreground">Choose a password for your pharmacy’s login. Next you’ll set up the supervising pharmacist and their PIN.</p>}
          </div>
          <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input" type="password" minLength={10} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 10 characters" /></div>
          <div><label className="label" htmlFor="pw2">Type it again</label><input id="pw2" className="input" type="password" minLength={10} required value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></div>
          {msg && <p className="text-sm text-destructive">{msg}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save password</button>
        </form>
      )}
    </main>
  );
}
