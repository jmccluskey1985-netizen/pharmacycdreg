'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, FileSpreadsheet, Loader2, StickyNote, CheckCircle2, Play, Flag, History } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStaff, useCan } from '@/components/dashboard/staff-context';
import { canWrite } from '@/lib/stripe';
import { buildSections, ddmmyyyy, downloadSheetXlsx, hhmm, lastCheckedText, type CountLine } from '@/lib/stock-sheet';

interface Count { id: string; status: 'open' | 'finished'; started_at: string; finished_at: string | null; started_by_name?: string | null; finished_by_name?: string | null }
type Line = CountLine & { register_id: string; id?: string };
const dt = (iso: string) => `${ddmmyyyy(new Date(iso))} ${hhmm(new Date(iso))}`;

/**
 * CD balances, and stock counts. Balances: every open book with its balance and last stock check.
 * Count mode: type the stock beside each book (saved as you go); the difference against the
 * register balance at that moment shows in green (0) or red; each line keeps its own date
 * because a count can run over days (the count's start date is top right) and a note (hover to
 * read). Tick Complete on a row to log it in that book as a stock check; Finish count logs the
 * rest and closes the count.
 */
export default function StockSheet() {
  const { pharmacy, staff } = useStaff();
  const canDo = useCan();
  const mayCount = !!staff && canDo('stockCheck') && canWrite(pharmacy?.subscription_status);
  const [regs, setRegs] = useState<any[] | null>(null);
  const [when, setWhen] = useState(() => new Date());
  const [withCount, setWithCount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<Count | null>(null);
  const [counts, setCounts] = useState<Count[]>([]);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [viewId, setViewId] = useState<string>('');
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);

  const loadRegs = useCallback(() => api('/api/registers').then((d) => { setRegs(d.registers ?? []); setWhen(new Date()); }).catch(() => setRegs([])), []);
  const loadCount = useCallback((id?: string) => api(`/api/stock-counts${id ? `?id=${id}` : ''}`).then((d) => {
    setCount(d.count); setCounts(d.counts ?? []); setLines(Object.fromEntries((d.lines ?? []).map((l: Line) => [l.register_id, l])));
  }).catch(() => {}), []);
  useEffect(() => { loadRegs(); }, [loadRegs]);
  useEffect(() => { if (withCount) loadCount(viewId || undefined); }, [withCount, viewId, loadCount]);

  const sections = useMemo(() => buildSections(regs ?? []), [regs]);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const due = sections.reduce((n, s) => n + s.rows.filter((r) => r.due).length, 0);
  const open = !!count && count.status === 'open' && mayCount;
  const done = Object.values(lines).filter((l) => l.stock_check_id).length;
  const entered = Object.values(lines).filter((l) => l.counted !== null).length;

  async function save(registerId: string, patch: Record<string, unknown>) {
    if (!count) return;
    setRowErr((e) => ({ ...e, [registerId]: '' }));
    try {
      const d = await api(`/api/stock-counts/${count.id}/line`, { method: 'PUT', json: { register_id: registerId, ...patch } });
      setLines((x) => ({ ...x, [registerId]: d.line }));
      if (patch.complete) loadRegs();
    } catch (e) {
      const err = e as ApiError & { data?: any };
      if (err?.data?.line) setLines((x) => ({ ...x, [registerId]: err.data.line }));
      setRowErr((x) => ({ ...x, [registerId]: e instanceof ApiError ? e.message : 'Not saved' }));
      if (patch.complete) setNoteOpen(registerId);
    }
  }
  async function start() { setBusy(true); try { const d = await api('/api/stock-counts', { method: 'POST' }); setCount(d.count); setLines({}); await loadCount(); } finally { setBusy(false); } }
  async function finish() {
    if (!count || !confirm('Finish this count? Every counted line is logged in its book as a stock check, and the count can no longer be changed.')) return;
    setBusy(true); setMsg(null);
    try { const d = await api(`/api/stock-counts/${count.id}/finish`, { method: 'POST' }); setMsg({ ok: true, text: `Count finished: ${d.recorded} book${d.recorded === 1 ? '' : 's'} logged${d.differences ? `, ${d.differences} with a difference` : ', all matching'}.` }); await loadCount(); await loadRegs(); }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not finish' }); }
    finally { setBusy(false); }
  }
  async function excel() {
    setBusy(true);
    try { await downloadSheetXlsx(sections, { name: pharmacy?.name, address: pharmacy?.address }, when, withCount, withCount ? lines : {}, withCount && count ? new Date(count.started_at) : undefined); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{withCount ? 'Stock count' : 'CD balances'}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{withCount ? 'Type the stock beside each book; it saves as you go and works out any difference. Tick Complete on a row to log it in that book. A count can run over several days: each line keeps its own date.' : 'Every open CD book with its balance right now and when its stock was last checked. Print it, save it as a PDF, or download it for Excel.'}</p>
          <label className="mt-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withCount} onChange={(e) => { setWithCount(e.target.checked); setViewId(''); setMsg(null); }} className="h-4 w-4" />
            Stock count (enter counts, differences and notes)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {withCount && counts.length > 0 && (
            <label className="inline-flex items-center gap-1.5 text-sm"><History className="h-4 w-4 text-muted-foreground" />
              <select className="input py-1.5" value={viewId} onChange={(e) => setViewId(e.target.value)} aria-label="Show a count">
                <option value="">{counts.some((c) => c.status === 'open') ? 'Current count' : 'Latest'}</option>
                {counts.filter((c) => c.status === 'finished').map((c) => <option key={c.id} value={c.id}>Finished {dt(c.finished_at!)}</option>)}
              </select>
            </label>
          )}
          <button onClick={excel} disabled={!total || busy} className="btn-secondary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel</button>
          <button onClick={() => window.print()} disabled={!total} className="btn-primary"><Printer className="h-4 w-4" /> Print / PDF</button>
        </div>
      </div>

      {withCount && mayCount && !viewId && (!count || count.status === 'finished') && (
        <div className="no-print flex flex-wrap items-center gap-3 rounded-xl bg-secondary p-3 text-sm">
          <span className="flex-1">{count ? `Last count finished ${dt(count.finished_at!)}.` : 'No count in progress.'} Start a count to enter today’s stock.</span>
          <button onClick={start} disabled={busy} className="btn-primary"><Play className="h-4 w-4" /> Start a count</button>
        </div>
      )}
      {msg && <p className={`no-print rounded-lg p-3 text-sm ${msg.ok ? 'bg-brand/10 text-brand-dark' : 'bg-destructive/10 text-destructive'}`}>{msg.text}</p>}

      <div className="print-page rounded-xl bg-white p-6 text-black shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-[#184B21] pb-3">
          <div>
            <p className="text-3xl font-extrabold tracking-tight text-[#184B21]">{withCount ? 'CD Stock Count' : 'CD Balances'}</p>
            <p className="text-sm text-slate-600">{[pharmacy?.name, pharmacy?.address].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            {withCount && count ? (
              <>
                <p className="text-lg font-bold">Start date: {dt(count.started_at)}</p>
                <p className="text-xs text-slate-600">{count.started_by_name ? `Started by ${count.started_by_name} · ` : ''}{count.status === 'finished' ? `Finished ${dt(count.finished_at!)}` : `${done} of ${total} complete · ${entered} counted`}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold">Date: {ddmmyyyy(when)}</p>
                <p className="text-xs text-slate-600">Balances at {hhmm(when)} · {total} book{total === 1 ? '' : 's'}{due ? ` · ${due} stock check${due === 1 ? '' : 's'} due` : ''}</p>
              </>
            )}
          </div>
        </div>

        {regs === null ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading your books…</p>
        ) : !total ? (
          <p className="mt-6 text-sm text-slate-600">No CD books are open yet.</p>
        ) : !withCount ? (
          <div className="mt-4 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[520px] border-collapse text-[15px] print:min-w-0 print:text-[13px]">
              <thead className="print:table-header-group"><tr className="bg-[#B7B7B7] [&>th]:border [&>th]:border-slate-400 [&>th]:px-3 [&>th]:py-2"><th className="text-left">CD Medicine</th><th className="w-[120px]">Balance</th><th className="w-[190px]">Last stock check</th></tr></thead>
              {sections.map((s) => (
                <tbody key={s.title} className="break-inside-avoid-page">
                  <tr><td colSpan={3} className="border border-slate-400 bg-[#E6F4E5] px-3 py-1.5 font-bold text-[#184B21]">{s.title}</td></tr>
                  {s.rows.map((r) => (
                    <tr key={r.id} className="h-10 break-inside-avoid [&>td]:border [&>td]:border-slate-400 [&>td]:px-3">
                      <td>{r.label}{r.quarantined ? <span className="ml-1 text-xs text-slate-600">(incl. {r.quarantined} set aside)</span> : null}</td>
                      <td className="text-center font-bold tabular-nums">{r.balance} <span className="text-xs font-normal text-slate-600">{r.unit}</span></td>
                      <td className={`text-center text-[13px] ${r.due ? 'font-semibold text-amber-700' : !r.lastChecked ? 'text-slate-500' : ''}`}>{lastCheckedText(r, when)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[860px] border-collapse text-[14px] print:min-w-0 print:text-[11px]">
              <thead className="print:table-header-group">
                <tr className="bg-[#B7B7B7] [&>th]:border [&>th]:border-slate-400 [&>th]:px-2 [&>th]:py-2">
                  <th className="text-left">CD Medicine</th><th className="w-[110px]">Register</th><th className="w-[110px]">Stock</th><th className="w-[90px]">Difference</th><th className="w-[130px]">Counted</th><th className="w-[56px]">Note</th><th className="w-[100px]">Complete</th>
                </tr>
              </thead>
              {sections.map((s) => (
                <tbody key={s.title} className="break-inside-avoid-page">
                  <tr><td colSpan={7} className="border border-slate-400 bg-[#E6F4E5] px-3 py-1.5 font-bold text-[#184B21]">{s.title}</td></tr>
                  {s.rows.map((r) => {
                    const L = lines[r.id];
                    const has = !!L && L.counted !== null;
                    const locked = !open || !!L?.stock_check_id;
                    const bal = has ? Number(L!.balance_at_count) : r.balance;
                    const diff = has ? Number(L!.counted) - bal : null;
                    return [
                      <tr key={r.id} className={`break-inside-avoid [&>td]:border [&>td]:border-slate-400 [&>td]:px-2 ${L?.stock_check_id ? 'bg-brand/5' : ''}`}>
                        <td className="py-1.5">{r.label}{L?.note ? <p className="hidden text-[10px] italic text-slate-600 print:block">Note: {L.note}</p> : null}</td>
                        <td className="text-center font-bold tabular-nums">{bal} <span className="text-xs font-normal text-slate-600">{r.unit}</span></td>
                        <td className="text-center">
                          {locked ? <span className="font-bold tabular-nums">{has ? Number(L!.counted) : ''}</span> : (
                            <input key={`${r.id}-${L?.counted ?? ''}`} type="number" min={0} inputMode="decimal" aria-label={`Stock counted: ${r.label}`} defaultValue={has ? Number(L!.counted) : ''}
                              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-center font-bold tabular-nums print:border-0"
                              onBlur={(e) => { const v = e.target.value.trim(); const cur = has ? String(Number(L!.counted)) : ''; if (v !== cur) save(r.id, { counted: v === '' ? null : Number(v) }); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                          )}
                        </td>
                        <td className="text-center">{diff === null ? '' : <span className={`inline-block min-w-[3rem] rounded-md px-2 py-0.5 font-bold tabular-nums ${diff === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{diff > 0 ? `+${diff}` : diff}</span>}</td>
                        <td className="text-center text-[12px] text-slate-700">{has && L!.counted_at ? <span title={L!.counted_by_name ? `Counted by ${L!.counted_by_name}` : undefined}>{dt(L!.counted_at)}</span> : ''}</td>
                        <td className="text-center">
                          <button type="button" disabled={locked && !L?.note} onClick={() => setNoteOpen(noteOpen === r.id ? null : r.id)} title={L?.note || (locked ? '' : 'Add a note')} aria-label={L?.note ? `Note: ${L.note}` : `Add a note: ${r.label}`}
                            className={`no-print inline-flex h-7 w-7 items-center justify-center rounded-md ${L?.note ? 'bg-amber-100 text-amber-800' : 'text-slate-400 hover:bg-slate-100'} ${diff !== null && diff !== 0 && !L?.note ? 'ring-2 ring-red-300' : ''}`}><StickyNote className="h-4 w-4" /></button>
                        </td>
                        <td className="text-center">
                          {L?.stock_check_id ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-dark"><CheckCircle2 className="h-4 w-4" /> Logged</span>
                            : open ? <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px]"><input type="checkbox" className="h-4 w-4 accent-[#54BD50]" disabled={!has} checked={false} onChange={() => save(r.id, { complete: true })} aria-label={`Complete: ${r.label}`} /> Complete</label> : ''}
                        </td>
                      </tr>,
                      (noteOpen === r.id || rowErr[r.id]) && (
                        <tr key={r.id + '-note'} className="no-print [&>td]:border [&>td]:border-slate-300">
                          <td colSpan={7} className="bg-amber-50/60 px-3 py-2">
                            {rowErr[r.id] && <p className="mb-1 text-[12px] font-semibold text-red-700">{rowErr[r.id]}</p>}
                            {noteOpen === r.id && (locked ? <p className="text-[13px]">{L?.note}</p> : (
                              <input autoFocus defaultValue={L?.note ?? ''} maxLength={500} aria-label={`Note: ${r.label}`} placeholder={diff ? 'What you found, e.g. 2 owed to patient; recounted' : 'Note for this book (optional)'}
                                className="w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-[13px]"
                                onBlur={(e) => { if ((e.target.value || null) !== (L?.note ?? null)) save(r.id, { note: e.target.value }); setNoteOpen(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                            ))}
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-600">
          {withCount ? 'Difference = stock counted minus the register balance when it was counted. A completed row is logged as a stock check in its book; anything still unexplained is investigated and recorded with Stock check in that book. ' : 'Balances include stock set aside for destruction. “Due” follows your Settings → Stock checks frequency. '}
          Printed from PharmacyCDReg.ie on {ddmmyyyy(when)} at {hhmm(when)}.
        </p>
      </div>

      {withCount && open && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-3 shadow-soft ring-1 ring-border">
          <span className="text-sm text-muted-foreground">{done} of {total} complete · {entered} counted. Finishing logs every counted book and closes the count.</span>
          <button onClick={finish} disabled={busy || !entered} className="btn-primary"><Flag className="h-4 w-4" /> Finish count</button>
        </div>
      )}
    </div>
  );
}
