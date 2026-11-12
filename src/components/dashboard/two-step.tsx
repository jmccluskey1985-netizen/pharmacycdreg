'use client';

import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Loader2, Trash2, Plus, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { DEMO } from '@/lib/demo/flag';

interface Factor { id: string; friendly_name?: string; status: string; created_at: string }

/**
 * Two-step sign-in for the pharmacy login, using an authenticator app (Google
 * Authenticator, Microsoft Authenticator, 1Password…). Once set up, signing in needs
 * the password AND a 6-digit code; the server refuses the dashboard and API until the
 * code step is done. Add a second phone as a backup in case one is lost.
 */
export function TwoStepSettings() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (DEMO) { setFactors([]); return; }
    const { data } = await getSupabaseClient().auth.mfa.listFactors();
    setFactors(((data?.all ?? []) as Factor[]).filter((f) => f.status === 'verified'));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function start() {
    setBusy(true); setError(null);
    try {
      const supabase = getSupabaseClient();
      // Clear any half-finished set-up first.
      const { data: all } = await supabase.auth.mfa.listFactors();
      for (const f of ((all?.all ?? []) as Factor[]).filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: name.trim() || `Phone ${(factors?.length ?? 0) + 1}` });
      if (e || !data) throw new Error(e?.message || 'Could not start');
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) {
      setError(DEMO ? 'Not available in the demo.' : e instanceof Error && /mfa|disabled|not enabled/i.test(e.message) ? 'Two-step sign-in is switched off for this site. In Supabase → Authentication → Multi-Factor, enable TOTP.' : 'Could not start set-up. Try again.');
    } finally { setBusy(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setBusy(true); setError(null);
    const { error: vErr } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: code.replace(/\s/g, '') });
    setBusy(false);
    if (vErr) { setError('That code didn’t work — use the newest code shown in the app.'); return; }
    setEnrolling(null); setCode(''); setName('');
    await fetch('/api/audit/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'security.two_step_added' }) }).catch(() => {});
    load();
  }

  async function remove(f: Factor) {
    const last = (factors?.length ?? 0) <= 1;
    if (!window.confirm(last ? 'Turn off two-step sign-in? Signing in will only need the password.' : `Remove “${f.friendly_name || 'this phone'}”?`)) return;
    setBusy(true); setError(null);
    const { error: e } = await getSupabaseClient().auth.mfa.unenroll({ factorId: f.id });
    setBusy(false);
    if (e) { setError('Could not remove it. Sign out and back in with a code, then try again.'); return; }
    await fetch('/api/audit/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'security.two_step_removed' }) }).catch(() => {});
    load();
  }

  const on = (factors?.length ?? 0) > 0;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <ShieldCheck className={`mt-0.5 h-5 w-5 flex-shrink-0 ${on ? 'text-brand' : 'text-muted-foreground'}`} />
        <div>
          <p className="font-semibold">Two-step sign-in {on ? <span className="ml-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">On</span> : <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Off</span>}</p>
          <p className="text-sm text-muted-foreground">Signing in to the pharmacy account also needs a 6-digit code from an authenticator app (Google or Microsoft Authenticator). Staff PINs work as before.</p>
        </div>
      </div>

      {factors && factors.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {factors.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-muted-foreground" /> {f.friendly_name || 'Authenticator'} <span className="text-xs text-muted-foreground">added {new Date(f.created_at).toLocaleDateString('en-IE')}</span></span>
              <button onClick={() => remove(f)} disabled={busy} className="btn-ghost text-sm text-destructive"><Trash2 className="h-4 w-4" /> Remove</button>
            </li>
          ))}
        </ul>
      )}

      {!enrolling ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1"><label className="label">{on ? 'Add a backup phone' : 'Name this phone'}</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={on ? 'e.g. Second pharmacist’s phone' : 'e.g. Supervising pharmacist’s phone'} /></div>
          <button onClick={start} disabled={busy} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {on ? 'Add phone' : 'Turn on'}</button>
        </div>
      ) : (
        <form onSubmit={confirm} className="space-y-3 rounded-xl border border-brand/40 bg-brand/5 p-4">
          <p className="text-sm"><b>1.</b> In your authenticator app, add an account and scan this code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg bg-white p-2" />
          <p className="text-xs text-muted-foreground">Can’t scan? Enter this key: <code className="select-all break-all">{enrolling.secret}</code></p>
          <p className="text-sm"><b>2.</b> Type the 6-digit code it shows.</p>
          <div className="flex gap-2">
            <input className="input max-w-[10rem] text-center text-lg font-semibold tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
            <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm</button>
            <button type="button" onClick={() => { setEnrolling(null); setCode(''); }} className="btn-ghost">Cancel</button>
          </div>
          <p className="text-xs text-muted-foreground">Tip: add a second phone as a backup. If every phone is lost, the account owner can reset it from Supabase.</p>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
