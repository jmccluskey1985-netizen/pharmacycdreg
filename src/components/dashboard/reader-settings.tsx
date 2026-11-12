'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScanText, Loader2, Check, KeyRound, X, Search } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Status { needs_migration: boolean; has_key: boolean; hint: string | null; models: string[]; updated_at: string | null; environment_fallback: boolean }
interface Model { id: string; name: string; prompt_price: number }
// Halo's chain (docs/RX_READER_SPEC.md §1): won Halo's test on real Irish prescriptions; all have zero-data providers.
const HALO_MODELS = ['google/gemini-3.8-flash', 'qwen/qwen3-vl-235b-a22b-instruct', 'qwen/qwen2.5-vl-72b-instruct'];

/** OpenRouter key + models for reading invoices, prescriptions and paper register pages. */
export function ReaderSettings() {
  const [st, setSt] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [all, setAll] = useState<Model[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true); setMsg(null);
    try { const d = await api('/api/settings/reader/test', { method: 'POST' }); setMsg({ ok: d.ok, text: d.message }); }
    catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'The test failed' }); }
    finally { setTesting(false); }
  }

  const [zdrOnly, setZdrOnly] = useState(false);
  const load = () => api('/api/settings/reader').then((d: Status) => { setSt(d); setModels(d.models); });
  useEffect(() => { load(); api('/api/settings/reader/models').then((d) => { setAll(d.models ?? []); setZdrOnly(!!d.zdr_filtered); }).catch(() => setAll([])); }, []);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (all ?? []).filter((m) => !models.includes(m.id) && (!t || `${m.name} ${m.id}`.toLowerCase().includes(t))).slice(0, 12);
  }, [all, q, models]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api('/api/settings/reader', { method: 'PUT', json: { api_key: key.trim() || undefined, models } });
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
          <h2 className="font-semibold">Document reading <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${st?.has_key && st.models.length ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground'}`}>{st?.has_key && st.models.length ? 'On' : 'Off'}</span></h2>
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

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="label mb-0">Models <span className="font-normal text-muted-foreground">(first is used; the others are back-ups)</span></label>
            <button type="button" onClick={() => setModels(HALO_MODELS)} className="btn-secondary py-1.5 text-sm">Use Halo’s models</button>
          </div>
          {models.length > 0 && (
            <ol className="mb-2 flex flex-wrap gap-1.5">
              {models.map((m, i) => (
                <li key={m} className="flex items-center gap-1 rounded-full border border-brand bg-brand/10 px-2.5 py-1 text-xs font-semibold">
                  <span className="text-muted-foreground">{i + 1}.</span> {all?.find((x) => x.id === m)?.name ?? m}
                  <button type="button" onClick={() => setModels(models.filter((x) => x !== m))} aria-label={`Remove ${m}`}><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ol>
          )}
          {models.length < 4 && (
            <div className="rounded-lg border border-border">
              <div className="relative border-b border-border"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="w-full rounded-t-lg bg-transparent py-2 pl-9 pr-3 text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder={all === null ? 'Loading models…' : 'Search models that can read photos, e.g. claude, gemini, gpt'} /></div>
              <ul className="max-h-48 overflow-y-auto text-sm">
                {all !== null && matches.length === 0 && <li className="px-3 py-2 text-muted-foreground">{all.length ? 'No match' : 'Couldn’t load the list — type a model id and press Add'}</li>}
                {matches.map((m) => (
                  <li key={m.id}><button type="button" onClick={() => { setModels([...models, m.id]); setQ(''); }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted">
                    <span><b>{m.name}</b> <span className="text-xs text-muted-foreground">{m.id}</span></span>
                    {m.prompt_price > 0 && <span className="text-xs text-muted-foreground">${m.prompt_price.toFixed(2)}/M in</span>}
                  </button></li>
                ))}
                {all?.length === 0 && q.trim() && <li><button type="button" onClick={() => { setModels([...models, q.trim()]); setQ(''); }} className="w-full px-3 py-2 text-left font-semibold text-primary hover:bg-muted">Add “{q.trim()}”</button></li>}
              </ul>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{zdrOnly ? 'Only models with a zero-data-retention provider are listed. ' : ''}Tip: “Use Halo’s models” sets Gemini 3.8 Flash with two Qwen back-ups — then Save and Test.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || !models.length || (!st?.has_key && key.trim().length < 20)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
          {st?.has_key && <button type="button" onClick={test} disabled={testing} className="btn-secondary">{testing && <Loader2 className="h-4 w-4 animate-spin" />} Test</button>}
        </div>
        {msg && <p className={`flex items-start gap-1 rounded-lg p-3 text-sm ${msg.ok ? 'bg-brand/10 text-brand' : 'bg-destructive/10 text-destructive'}`}>{msg.ok && <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />} {msg.text}</p>}
      </form>
    </section>
  );
}
