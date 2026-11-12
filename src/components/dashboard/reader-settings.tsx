'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScanText, Loader2, Check, KeyRound, X, Search } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Status { needs_migration: boolean; has_key: boolean; hint: string | null; models: string[]; updated_at: string | null; environment_fallback: boolean }
interface Model { id: string; name: string; prompt_price: number }

/** OpenRouter key + models for reading invoices, prescriptions and paper register pages. */
export function ReaderSettings() {
  const [st, setSt] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [all, setAll] = useState<Model[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api('/api/settings/reader').then((d: Status) => { setSt(d); setModels(d.models); });
  useEffect(() => { load(); api('/api/settings/reader/models').then((d) => setAll(d.models ?? [])).catch(() => setAll([])); }, []);

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
          <label className="label">Models <span className="font-normal text-muted-foreground">(first is used; the others are back-ups)</span></label>
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
          <p className="mt-1 text-xs text-muted-foreground">Tip: use the same model Halo uses for prescriptions.</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy || !models.length || (!st?.has_key && key.trim().length < 20)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
          {msg && <span className={`flex items-center gap-1 text-sm ${msg.ok ? 'text-brand' : 'text-destructive'}`}>{msg.ok && <Check className="h-4 w-4" />} {msg.text}</span>}
        </div>
      </form>
    </section>
  );
}
