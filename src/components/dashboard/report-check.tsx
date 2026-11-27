'use client';

import { compressAll } from '@/lib/compress-image';
import { useState } from 'react';
import { FileSearch, Loader2, CheckCircle2, AlertTriangle, Plus, Clock, UserCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { irishToday, isLate } from '@/lib/late-entry';

type Kind = 'supply' | 'receipt';
interface Line {
  i: number; status: 'in_register' | 'missing' | 'quantity_differs'; seq: number | null; register_quantity: number | null; why: string; late: boolean;
  row: { date: string; kind: Kind; name: string | null; reference: string | null; quantity: number; prescriber: string | null; date_options?: string[] };
  patient?: { id: string; name: string; address: string | null } | null;
  draft?: Record<string, any>;
}
type Result = { ok: true; seq: number } | { ok: false; error: string };

const fmt = (d: string) => d.split('-').reverse().join('/').replace(/\/20(\d\d)$/, '/$1');
const NOTE = 'Added at stock check from the dispensing report';

/**
 * Stock check against a dispensing-system report: upload it, see which report lines aren't in the
 * register (highlighted), tick the ones to add and add them in one go. Lines older than a day are
 * late entries and carry the footnote. Quantity differences are shown to investigate, never added.
 */
export function ReportCheck({ registerId, unit, balance, counted, draft = false, onAdded, preloaded, title }: { registerId: string; unit: string; balance: number; counted: number | null; draft?: boolean; onAdded: () => void; preloaded?: { lines: Line[]; skipped: number; warnings: string[] }; title?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ lines: Line[]; skipped: number; warnings: string[] } | null>(preloaded ?? null);
  const [sel, setSel] = useState<Record<number, boolean>>(() => preloaded ? Object.fromEntries(preloaded.lines.filter((l) => l.status === 'missing' && !((l.row.date_options?.length ?? 0) > 1)).map((l) => [l.i, true])) : {});
  const [edit, setEdit] = useState<Record<number, Record<string, string>>>({});
  const [reason, setReason] = useState(`Not entered on the day; found at the stock check on ${fmt(irishToday())} by checking the dispensing report`);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [adding, setAdding] = useState(false);

  async function read(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setError(null); setData(null); setResults({});
    try {
      const fd = new FormData();
      fd.append('register_id', registerId);
      (await compressAll(list)).forEach((f) => fd.append('file', f));
      const d = await api('/api/stock-checks/reconcile', { method: 'POST', body: fd });
      setData(d);
      setSel(Object.fromEntries(d.lines.filter((l: Line) => l.status === 'missing' && !((l.row.date_options?.length ?? 0) > 1)).map((l: Line) => [l.i, true])));
      setEdit({});
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not read the report'); }
    finally { setBusy(false); }
  }

  const missing = data?.lines.filter((l) => l.status === 'missing') ?? [];
  const differs = data?.lines.filter((l) => l.status === 'quantity_differs') ?? [];
  const found = data?.lines.filter((l) => l.status === 'in_register') ?? [];
  const value = (l: Line, k: string) => edit[l.i]?.[k] ?? l.draft?.[k] ?? '';
  const chosen = missing.filter((l) => sel[l.i] && !results[l.i]?.ok);
  const unsure = (l: Line) => (l.row.date_options?.length ?? 0) > 1;
  const lateOf = (l: Line) => isLate(String(value(l, 'transaction_date') || l.row.date));
  const needsDate = (l: Line) => unsure(l) && !edit[l.i]?.transaction_date;
  const needs = (l: Line) => needsDate(l) || (l.row.kind === 'supply' ? !value(l, 'recipient_name').trim() || value(l, 'recipient_address').trim().length < 3 : !value(l, 'supplier_name').trim() || value(l, 'supplier_address').trim().length < 3);
  const effect = chosen.reduce((n, l) => n + (l.row.kind === 'receipt' ? l.row.quantity : -l.row.quantity), 0);
  const anyLate = chosen.some(lateOf);
  const blocked = chosen.some(needs) || (anyLate && reason.trim().length < 5);

  async function addAll() {
    setAdding(true);
    // Receipts first, then by date, so the balance never dips below zero on the way
    const order = [...chosen].sort((a, b) => (a.row.kind === b.row.kind ? a.row.date.localeCompare(b.row.date) : a.row.kind === 'receipt' ? -1 : 1));
    let added = 0;
    for (const l of order) {
      const d = { ...l.draft, ...edit[l.i] };
      try {
        const r = await api(draft ? '/api/entries/drafts' : '/api/entries', { method: 'POST', json: {
          register_id: registerId, ...d, quantity: Number(d.quantity),
          notes: [d.notes, NOTE].filter(Boolean).join(' · '),
          late_reason: lateOf(l) ? reason.trim() : undefined,
          ...(draft ? {} : { interactive: false }),
        } });
        setResults((x) => ({ ...x, [l.i]: { ok: true, seq: r.seq ?? 0 } }));
        added++;
      } catch (e) {
        const msg = e instanceof ApiError ? (e.code === 'DUPLICATE' || e.code === 'POSSIBLE_DUPLICATE' ? `Looks like it’s already in the register (${e.message}). Not added.` : e.message) : 'Could not add';
        setResults((x) => ({ ...x, [l.i]: { ok: false, error: msg } }));
      }
    }
    setAdding(false);
    if (added) onAdded();
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
      {title ?? (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold"><FileSearch className="h-4 w-4 text-brand" /> Check against a dispensing report</p>
          <p className="text-xs text-muted-foreground">Upload a CD report from your dispensing system: photos of each page, or the saved file in any format (PDF, Excel, CSV, Touchstore .QRP…). Anything on it that isn’t in this register is highlighted.</p>
        </div>
        <label className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} {busy ? 'Reading report…' : data ? 'Another report' : 'Upload report'}
          <input type="file" multiple aria-label="Report file" className="sr-only" onChange={(e) => { read(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      )}
      {error && <p className="text-destructive">{error}</p>}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-brand/15 px-2.5 py-1 font-semibold text-brand-dark">{found.length} in the register</span>
            <span className={`rounded-full px-2.5 py-1 font-semibold ${missing.length ? 'bg-amber-100 text-amber-900' : 'bg-muted text-muted-foreground'}`}>{missing.length} missing</span>
            {differs.length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-800">{differs.length} quantity differs</span>}
            {data.skipped > 0 && <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{data.skipped} other lines skipped</span>}
          </div>
          {data.warnings.length > 0 && <ul className="space-y-0.5 text-xs text-amber-800">{data.warnings.map((w, k) => <li key={k}>⚠ {w}</li>)}</ul>}

          {missing.length === 0 && differs.length === 0 && <p className="flex items-center gap-2 font-semibold text-brand"><CheckCircle2 className="h-4 w-4" /> Every line on the report is in the register.</p>}

          {missing.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <p className="font-bold uppercase tracking-wide text-muted-foreground">Not in the register</p>
                <span className="flex gap-3"><button type="button" className="underline" onClick={() => setSel(Object.fromEntries(missing.map((l) => [l.i, true])))}>Tick all</button><button type="button" className="underline" onClick={() => setSel({})}>Untick all</button></span>
              </div>
              {missing.map((l) => {
                const res = results[l.i];
                const sup = l.row.kind === 'supply';
                return (
                  <div key={l.i} className={`rounded-lg p-2.5 ring-1 ${res?.ok ? 'bg-brand/10 ring-brand/30' : sel[l.i] ? 'bg-amber-50 ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-800' : 'bg-muted/40 ring-border'}`}>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#54BD50]" disabled={!!res?.ok || adding} checked={!!sel[l.i] || !!res?.ok} onChange={(e) => setSel((x) => ({ ...x, [l.i]: e.target.checked }))} aria-label={`Add ${l.row.name ?? 'line'} ${fmt(l.row.date)}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <b className="tabular-nums">{unsure(l) ? (edit[l.i]?.transaction_date ? fmt(edit[l.i].transaction_date) : `?${fmt(l.row.date).slice(1)}`) : fmt(l.row.date)}</b>
                          <span className={`rounded px-1.5 text-[10px] font-bold uppercase ${sup ? 'bg-slate-100 text-slate-700' : 'bg-sky-100 text-sky-900'}`}>{sup ? 'Supply' : 'Receipt'}</span>
                          <span className="font-semibold">{(sup ? value(l, 'recipient_name') : value(l, 'supplier_name')) || l.row.name || 'No name on report'}</span>
                          {l.row.reference && <span className="text-xs text-muted-foreground">{/^[A-Za-z]/.test(l.row.reference) ? l.row.reference : `${sup ? 'Rx' : 'Inv'} ${l.row.reference}`}</span>}
                          <b className={`ml-auto tabular-nums ${sup ? 'text-red-700' : 'text-brand-dark'}`}>{sup ? '−' : '+'}{l.row.quantity} {unit}</b>
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                          {unsure(l) && !edit[l.i]?.transaction_date && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 font-semibold text-red-800">Date partly cut off on the photo: pick the day</span>}
                          {lateOf(l) && !needsDate(l) && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 font-semibold text-violet-900"><Clock className="h-3 w-3" /> Over 24 hours: late entry with footnote</span>}
                          {l.patient && <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 font-semibold text-brand-dark"><UserCheck className="h-3 w-3" /> {l.patient.name}</span>}
                        </span>
                      </span>
                    </label>
                    {unsure(l) && !res?.ok && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs">
                        <span className="font-semibold">Which day?</span>
                        {l.row.date_options!.map((d) => (
                          <button key={d} type="button" onClick={() => { setEdit((x) => ({ ...x, [l.i]: { ...x[l.i], transaction_date: d } })); setSel((x) => ({ ...x, [l.i]: true })); }}
                            className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${edit[l.i]?.transaction_date === d ? 'bg-brand text-white ring-brand' : 'bg-card ring-border'}`}>{fmt(d)}</button>
                        ))}
                        <span className="text-muted-foreground">Check the full report or the Rx.</span>
                      </div>
                    )}
                    {sel[l.i] && !res?.ok && needs(l) && !needsDate(l) && (
                      <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-2">
                        <input className="input py-1.5" placeholder={sup ? 'Patient name' : 'Supplier'} value={value(l, sup ? 'recipient_name' : 'supplier_name')} onChange={(e) => setEdit((x) => ({ ...x, [l.i]: { ...x[l.i], [sup ? 'recipient_name' : 'supplier_name']: e.target.value } }))} />
                        <input className="input py-1.5" placeholder={sup ? 'Patient address (needed for the register)' : 'Supplier address'} value={value(l, sup ? 'recipient_address' : 'supplier_address')} onChange={(e) => setEdit((x) => ({ ...x, [l.i]: { ...x[l.i], [sup ? 'recipient_address' : 'supplier_address']: e.target.value } }))} />
                      </div>
                    )}
                    {res && <p className={`mt-1.5 pl-6 text-xs font-semibold ${res.ok ? 'text-brand-dark' : 'text-destructive'}`}>{res.ok ? (draft ? <>✓ Saved as a draft for a pharmacist to sign</> : <>✓ Added: register line {res.seq}</>) : res.error}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {differs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Quantity differs: check, then correct the line if needed</p>
              {differs.map((l) => (
                <div key={l.i} className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 ring-1 ring-red-200 dark:bg-red-950/40 dark:ring-red-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-700" />
                  <span><b>{fmt(l.row.date)}</b> {l.row.name}: {l.why}.</span>
                </div>
              ))}
            </div>
          )}

          {found.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-muted-foreground">{found.length} report line{found.length === 1 ? '' : 's'} found in the register</summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-muted-foreground">{found.map((l) => <li key={l.i}>✓ {fmt(l.row.date)} {l.row.name ?? ''} {l.row.kind === 'supply' ? '−' : '+'}{l.row.quantity}: line {l.seq} ({l.why.toLowerCase()})</li>)}</ul>
            </details>
          )}

          {chosen.length > 0 && (
            <div className="space-y-2 rounded-lg bg-muted/60 p-3">
              {anyLate && (
                <div>
                  <label className="label">Footnote for late entries (over 24 hours)</label>
                  <textarea className="input min-h-[56px]" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <p className="mt-1 text-xs text-muted-foreground">Each late line shows: <i>Late entry: {reason.trim() || '…'}</i></p>
                </div>
              )}
              <p className="text-xs">
                Balance now <b>{balance}</b> → after adding <b>{balance + effect} {unit}</b>
                {counted != null && <> · counted <b>{counted}</b> {balance + effect === counted ? <span className="font-semibold text-brand">✓ matches</span> : <span className="font-semibold text-amber-700">(register would still be {Math.abs(balance + effect - counted)} {balance + effect > counted ? 'more' : 'fewer'} than counted)</span>}</>}
              </p>
              <button type="button" onClick={addAll} disabled={adding || blocked} className="btn-primary w-full">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {draft ? 'Save' : 'Sign & add'} {chosen.length} missing entr{chosen.length === 1 ? 'y' : 'ies'}{draft ? ' for a pharmacist to sign' : ''}
              </button>
              {blocked && <p className="text-xs text-destructive">{chosen.some(needsDate) ? 'Pick the day for lines whose date is cut off.' : chosen.some(needs) ? 'Fill in the name and address on the highlighted lines.' : 'Add a footnote for the late entries.'}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
