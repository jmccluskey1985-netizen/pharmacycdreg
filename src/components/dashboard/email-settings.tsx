'use client';

import { useEffect, useState } from 'react';
import { Mail, Loader2, Check, X, Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Status {
  on: boolean; welcome_from: string; support_from: string; from_name: string;
  mailbox: string | null; mailbox_set: boolean; service_account: string | null; has_key: boolean;
  admin_notify: string | null; my_email: string | null;
}

function Row({ label, value, ok }: { label: string; value: React.ReactNode; ok: boolean }) {
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      {ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all">{value}</span>
    </div>
  );
}

/** Site owner only: what email is set up, and a one-click test from each sender. */
export function EmailSettings() {
  const [st, setSt] = useState<Status | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<'welcome' | 'support' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { api('/api/settings/email-test').then((d: Status) => { setSt(d); setTo(d.my_email ?? ''); }).catch(() => {}); }, []);

  async function test(sender: 'welcome' | 'support') {
    setBusy(sender); setMsg(null);
    try { const d = await api('/api/settings/email-test', { method: 'POST', json: { to, sender } }); setMsg({ ok: d.ok, text: d.message }); }
    catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'The test failed' }); }
    finally { setBusy(null); }
  }

  if (!st) return <div className="card p-5"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-brand" /> Email</h2>
        <p className="mt-1 text-sm text-muted-foreground">Welcome and invitation emails come from <b>{st.welcome_from}</b>; everything else (reminders, billing, notices) from <b>{st.support_from}</b>. Replies go to {st.support_from}. Only you see this tab.</p>
      </div>
      <div className="divide-y divide-border rounded-lg bg-muted/40 px-3">
        <Row label="Email switched on" value={st.on ? 'Yes' : 'No: set EMAIL_FROM in Vercel'} ok={st.on} />
        <Row label="Sends through mailbox" value={st.mailbox ?? 'Not set'} ok={!!st.mailbox && st.mailbox_set} />
        <Row label="Service account" value={st.service_account ?? 'Not set'} ok={!!st.service_account} />
        <Row label="Private key" value={st.has_key ? 'Set (hidden)' : 'Not set'} ok={st.has_key} />
        <Row label="Owner notices go to" value={st.admin_notify ?? 'Not set'} ok={!!st.admin_notify} />
      </div>
      <div className="space-y-2">
        <label className="label" htmlFor="email-test-to">Send a test to</label>
        <input id="email-test-to" className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => test('welcome')} disabled={!!busy || !to} className="btn-primary">{busy === 'welcome' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Test from {st.welcome_from}</button>
          <button onClick={() => test('support')} disabled={!!busy || !to} className="btn-secondary">{busy === 'support' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Test from {st.support_from}</button>
        </div>
      </div>
      {msg && <p className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-secondary' : 'bg-destructive/10 text-destructive'}`}>{msg.text}</p>}
    </div>
  );
}
