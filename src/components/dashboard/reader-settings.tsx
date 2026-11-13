'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanText, Loader2, Check, KeyRound, ShieldCheck, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Status {
  needs_migration: boolean; needs_vertex_migration?: boolean;
  provider: 'openrouter' | 'vertex';
  has_key: boolean; hint: string | null;
  vertex?: { has_key: boolean; client_email: string | null; project: string | null; location: string };
  locations?: { id: string; label: string }[];
  environment_fallback: boolean;
}

/**
 * Site owner only: the one document reader every pharmacy's scanning uses.
 * Recommended: Google Vertex AI in the EU (one Google Cloud DPA, processing stays in the EU).
 * OpenRouter remains available as an alternative.
 */
export function ReaderSettings() {
  const [st, setSt] = useState<Status | null>(null);
  const [tab, setTab] = useState<'vertex' | 'openrouter'>('vertex');
  const [key, setKey] = useState('');
  const [saJson, setSaJson] = useState('');
  const [location, setLocation] = useState('eu');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api('/api/settings/reader').then((d: Status) => { setSt(d); setTab(d.provider === 'openrouter' && d.has_key && !d.vertex?.has_key ? 'openrouter' : 'vertex'); setLocation(d.vertex?.location ?? 'eu'); });
  useEffect(() => { load(); }, []);
  const active = st?.provider === 'vertex' ? !!st.vertex?.has_key : !!st?.has_key;

  async function test() {
    setTesting(true); setMsg(null);
    try { const d = await api('/api/settings/reader/test', { method: 'POST' }); setMsg({ ok: d.ok, text: d.message }); }
    catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'The test failed' }); }
    finally { setTesting(false); }
  }
  async function save(json: Record<string, unknown>, done: string) {
    setBusy(true); setMsg(null);
    try { await api('/api/settings/reader', { method: 'PUT', json }); setKey(''); setSaJson(''); setMsg({ ok: true, text: done }); load(); }
    catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save' }); }
    finally { setBusy(false); }
  }
  async function remove(provider: 'vertex' | 'openrouter') {
    if (!confirm(provider === 'vertex' ? 'Remove the Google key? Scanning switches back to OpenRouter (if a key is saved) or stops.' : 'Remove the OpenRouter key?')) return;
    await api(`/api/settings/reader${provider === 'vertex' ? '?provider=vertex' : ''}`, { method: 'DELETE' }); load();
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-start gap-3">
        <ScanText className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
        <div>
          <h2 className="font-semibold">Document reading <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${active ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground'}`}>{active ? (st?.provider === 'vertex' ? 'On — Google Vertex AI (EU)' : 'On — OpenRouter') : 'Off'}</span></h2>
          <p className="text-sm text-muted-foreground">Site owner only — one reader for invoices, prescriptions and paper register pages at <b>every pharmacy</b>. Other pharmacies never see this. Keys are encrypted and never shown again.</p>
        </div>
      </div>
      {st?.needs_migration && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run migration 0009 in Supabase.</p>}
      {st?.needs_vertex_migration && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">To use Google Vertex AI, run migration 0014 in Supabase first.</p>}

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm">
        <button type="button" onClick={() => setTab('vertex')} className={`rounded-lg px-2 py-2 font-semibold ${tab === 'vertex' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Google Vertex AI (EU) · recommended</button>
        <button type="button" onClick={() => setTab('openrouter')} className={`rounded-lg px-2 py-2 font-semibold ${tab === 'openrouter' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>OpenRouter</button>
      </div>

      {tab === 'vertex' ? (
        <form onSubmit={(e) => { e.preventDefault(); save({ provider: 'vertex', location, service_account_json: saJson.trim() || undefined, models: [] }, 'Saved — scanning now uses Google Vertex AI in the EU. Press Test to check.'); }} className="space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-brand/10 p-3 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" /> Gemini, run by Google Cloud in the EU. Covered by the Google Cloud Data Processing Addendum; Google doesn’t use the data to train its models, and the photos are processed in the EU.</p>
          <div>
            <label className="label">Service-account key (JSON file)</label>
            {st?.vertex?.has_key && <p className="mb-2 flex flex-wrap items-center gap-2 text-sm"><span className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2"><KeyRound className="h-4 w-4" /> {st.vertex.client_email} · project <code>{st.vertex.project}</code></span><button type="button" onClick={() => remove('vertex')} className="btn-ghost text-sm text-destructive">Remove</button></p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary"><Upload className="h-4 w-4" /> {st?.vertex?.has_key ? 'Replace key file' : 'Choose key file'}</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setSaJson(await f.text()); e.target.value = ''; }} />
              {saJson && <span className="self-center text-sm text-brand">Key file loaded — press Save</span>}
            </div>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold">How to get it (5 minutes, once)</summary>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>console.cloud.google.com → create a project (e.g. “pharmacycdreg”) and add billing.</li>
                <li>APIs &amp; Services → enable <b>Vertex AI API</b>.</li>
                <li>IAM &amp; Admin → Service accounts → Create → grant the role <b>Vertex AI User</b>.</li>
                <li>Open it → Keys → Add key → JSON. A file downloads — choose it above, then delete it from your computer.</li>
                <li>Admin console / Cloud console → Legal: review and accept the Cloud Data Processing Addendum.</li>
              </ol>
            </details>
          </div>
          <div><label className="label">Where it runs</label>
            <select className="input" value={location} onChange={(e) => setLocation(e.target.value)}>{(st?.locations ?? [{ id: 'eu', label: 'EU multi-region' }]).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm">Reads with <b>Gemini 3.8 Flash</b>; if Google doesn’t serve it in the chosen location, Gemini 2.5 Flash takes over. Test shows which answered.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || (!st?.vertex?.has_key && !saJson)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {st?.provider === 'vertex' ? 'Save' : 'Save & switch to Google'}</button>
            {st?.provider === 'vertex' && st.vertex?.has_key && <button type="button" onClick={test} disabled={testing} className="btn-secondary">{testing && <Loader2 className="h-4 w-4 animate-spin" />} Test</button>}
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); save({ provider: 'openrouter', api_key: key.trim() || undefined, models: [] }, 'Saved — scanning now uses OpenRouter.'); }} className="space-y-4">
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">OpenRouter forwards photos to the model’s provider (zero-data-retention only), usually outside the EU. Its standard terms ask customers not to send sensitive data such as health records unless agreed, and a signed DPA needs its Enterprise plan. Prefer Google Vertex AI.</p>
          <div>
            <label className="label">OpenRouter API key</label>
            {st?.has_key ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm"><KeyRound className="h-4 w-4" /> Saved key <code>{st.hint}</code></span>
                <input className="input flex-1" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste a new key to replace it" />
                <button type="button" onClick={() => remove('openrouter')} className="btn-ghost text-sm text-destructive">Remove</button>
              </div>
            ) : (
              <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-or-v1-…" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={busy || (!st?.has_key && key.trim().length < 20)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {st?.provider === 'openrouter' ? 'Save' : 'Save & switch to OpenRouter'}</button>
            {st?.provider === 'openrouter' && st.has_key && <button type="button" onClick={test} disabled={testing} className="btn-secondary">{testing && <Loader2 className="h-4 w-4 animate-spin" />} Test</button>}
          </div>
        </form>
      )}
      {msg && <p className={`flex items-start gap-1 rounded-lg p-3 text-sm ${msg.ok ? 'bg-brand/10 text-brand' : 'bg-destructive/10 text-destructive'}`}>{msg.ok && <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />} {msg.text}</p>}
    </section>
  );
}
