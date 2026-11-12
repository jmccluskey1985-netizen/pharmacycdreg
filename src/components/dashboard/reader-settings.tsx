'use client';

import { useEffect, useState } from 'react';
import { ScanText, Loader2, Check, KeyRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Status { needs_migration: boolean; has_key: boolean; hint: string | null; models: string[]; updated_at: string | null; environment_fallback: boolean }


/** OpenRouter key + models for reading invoices, prescriptions and paper register pages. */
export function ReaderSettings() {
  const [st, setSt] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true); setMsg(null);
    try { const d = await api('/api/settings/reader/test', { method: 'POST' }); setMsg({ ok: d.ok, text: d.message }); }
    catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'The test failed' }); }
    finally { setTesting(false); }
  }

  const load = () => api('/api/settings/reader').then((d: Status) => setSt(d));
  useEffect(() => { load(); }, []);


  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api('/api/settings/reader', { method: 'PUT', json: { api_key: key.trim() || undefined, models: [] } });
      setKey(''); setMsg({ ok: true, text: 'Saved — scanning is ready.' }); load();
    } catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save' }); }
    finally { setBusy(false); }
  }
  async function removeKey() {
    if (!confirm('Remove the OpenRouter key? Scanning will stop until a key is added again.')) return;
    await api('/api/settings/reader', { method: 'DELETE' }); load();
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-start gap-3">
        <ScanText className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
        <div>
          <h2 className="font-semibold">Document reading <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${st?.has_key ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground'}`}>{st?.has_key ? 'On' : 'Off'}</span></h2>
          <p className="text-sm text-muted-foreground">Site owner only — one OpenRouter account (the same one Halo uses) reads invoices, prescriptions and paper register pages for <b>every pharmacy</b>. Other pharmacies never see this or need a key. Only providers that keep no data are used. The key is encrypted and never shown again.</p>
        </div>
      </div>
      {st?.needs_migration && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run <code>supabase/migrations/0009_reader_settings.sql</code> (site_secrets) in Supabase.</p>}

      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="label">OpenRouter API key</label>
          {st?.has_key ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm"><KeyRound className="h-4 w-4" /> Saved key <code>{st.hint}</code></span>
              <input className="input flex-1" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste a new key to replace it" />
              <button type="button" onClick={removeKey} className="btn-ghost text-sm text-destructive">Remove</button>
            </div>
          ) : (
            <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-or-v1-…" />
          )}
          <p className="mt-1 text-xs text-muted-foreground">openrouter.ai → Keys. In OpenRouter → Settings → Privacy, keep “Zero data retention” on.</p>
        </div>

        <p className="rounded-lg bg-secondary px-3 py-2 text-sm">Reads with <b>Gemini 3.8 Flash</b>, with Halo’s two Qwen models as back-ups — the same set-up as Halo.</p>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || (!st?.has_key && key.trim().length < 20)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
          {st?.has_key && <button type="button" onClick={test} disabled={testing} className="btn-secondary">{testing && <Loader2 className="h-4 w-4 animate-spin" />} Test</button>}
        </div>
        {msg && <p className={`flex items-start gap-1 rounded-lg p-3 text-sm ${msg.ok ? 'bg-brand/10 text-brand' : 'bg-destructive/10 text-destructive'}`}>{msg.ok && <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />} {msg.text}</p>}
      </form>
    </section>
  );
}
