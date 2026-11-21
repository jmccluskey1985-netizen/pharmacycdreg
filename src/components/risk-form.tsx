'use client';

import { useEffect, useRef, useState } from 'react';
import { Printer, RotateCcw, ShieldCheck, BadgeCheck } from 'lucide-react';
import { RISKS, LEVELS, PLAN, rating, freshRisk, type Level, type Row, type RiskState } from '@/lib/risk-assessment';

const KEY = 'pcdr-risk-assessment-v1';
const HEAD = [
  ['pharmacy', 'Pharmacy name'], ['psi', 'PSI registration no. (pharmacy)'], ['address', 'Address'],
  ['assessor', 'Assessed by (name and role)'], ['date', 'Date of assessment'], ['golive', 'Changeover date'],
  ['system', 'System and version'], ['review', 'Review date'],
] as const;
const tone = (l: Level) => (l === 'High' ? 'bg-red-100 text-red-800' : l === 'Medium' ? 'bg-amber-100 text-amber-900' : l === 'Low' ? 'bg-brand/15 text-brand-dark' : 'bg-muted text-muted-foreground');
const field = 'w-full rounded-md border border-border bg-white px-2 py-1 text-sm disabled:bg-transparent disabled:border-transparent disabled:px-0 disabled:text-foreground print:border-0 print:border-b print:border-slate-400 print:rounded-none print:px-0';
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Dublin' });
export interface Signature { name: string; psi: string | null; role: string; at: string }

/**
 * The risk assessment form. Every answer starts filled in (system controls, suggested local
 * controls and ratings). Public: saved in this browser only, signed by hand on the printout.
 * Pharmacy (dashboard): filled from the account, saved to it, signed electronically.
 */
export function RiskForm({ mode = 'public', initial, onChange, auto = {}, readOnly = false, signature, signArea }: {
  mode?: 'public' | 'pharmacy'; initial?: RiskState; onChange?: (s: RiskState) => void; auto?: Record<string, boolean>;
  readOnly?: boolean; signature?: Signature | null; signArea?: React.ReactNode;
}) {
  const [s, setS] = useState<RiskState>(() => initial ?? freshRisk({ system: 'PharmacyCDReg.ie' }));
  const [loaded, setLoaded] = useState(mode !== 'public');
  const first = useRef(true);
  useEffect(() => {
    if (mode !== 'public') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read this browser's saved draft after hydration
    try { const raw = localStorage.getItem(KEY); if (raw) { const v = JSON.parse(raw); const f = freshRisk({ system: 'PharmacyCDReg.ie' }); setS({ ...f, ...v, rows: { ...f.rows, ...(v.rows ?? {}) } }); } } catch { /* private window */ }
    setLoaded(true);
  }, [mode]);
  useEffect(() => {
    if (!loaded) return;
    if (first.current) { first.current = false; return; }
    if (mode === 'public') { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not saved */ } }
    else onChange?.(s);
  }, [s, loaded, mode, onChange]);
  const setRow = (id: string, k: keyof Row, v: string) => setS((x) => ({ ...x, rows: { ...x.rows, [id]: { ...x.rows[id], [k]: v } } }));
  const ticked = (k: string) => (s.plan[k] ?? auto[k] ?? false);

  return (
    <div className="space-y-8">
      {mode === 'public' && (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl bg-secondary p-3 text-sm">
          <ShieldCheck className="h-4 w-4 text-brand" />
          <span className="flex-1">Every answer is filled in with a suggestion: change anything that’s different for you. It’s saved in this browser as you type (nothing is sent to us). Print or save as PDF, then sign it.</span>
          <button onClick={() => window.print()} className="btn-primary"><Printer className="h-4 w-4" /> Print or save as PDF</button>
          <button onClick={() => { if (confirm('Clear everything you’ve typed and start again?')) setS(freshRisk({ system: 'PharmacyCDReg.ie' })); }} className="btn-ghost"><RotateCcw className="h-4 w-4" /> Start again</button>
        </div>
      )}

      <section>
        <h2 className="text-xl font-bold">1. Details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {HEAD.map(([k, label]) => (
            <label key={k} className="text-sm"><span className="font-semibold">{label}</span>
              <input disabled={readOnly} className={`${field} mt-1`} type={k === 'date' || k === 'golive' || k === 'review' ? 'date' : 'text'} value={s.head[k] ?? ''} onChange={(e) => setS((x) => ({ ...x, head: { ...x.head, [k]: e.target.value } }))} />
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground"><b>Records covered:</b> Controlled Drugs Register (Schedule 2), including receipts, supplies, corrections and witnessed destructions, and the CD destruction record for patient returns.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold">2. Risks and controls</h2>
        <p className="mt-1 text-sm text-muted-foreground">How the system controls each risk, your own local controls, and the risk that remains (likelihood × impact). Suggested answers are filled in: change any that are different for your pharmacy.</p>
        <div className="mt-4 space-y-4">
          {RISKS.map((r, n) => {
            const row = s.rows[r.id];
            const overall = rating(row.likelihood, row.impact);
            return (
              <article key={r.id} className="break-inside-avoid rounded-2xl bg-card p-4 shadow-soft ring-1 ring-border print:rounded-none print:shadow-none print:ring-slate-300">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-brand">{n + 1}. {r.area}</p>
                    <p className="mt-0.5 font-semibold">{r.risk}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">IPU {r.ipu}</span>
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">How the system controls it</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{r.system.map((t) => <li key={t}>{t}</li>)}</ul>
                  </div>
                  <label className="block text-sm">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Our local controls</span>
                    <textarea disabled={readOnly} className={`${field} mt-1 min-h-[4.5rem] resize-y [field-sizing:content]`} value={row.local} onChange={(e) => setRow(r.id, 'local', e.target.value)} />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
                  {(['likelihood', 'impact'] as const).map((k) => (
                    <label key={k} className="text-xs font-semibold capitalize">{k}
                      <select disabled={readOnly} className={`${field} mt-1 w-28`} value={row[k]} onChange={(e) => setRow(r.id, k, e.target.value)}>
                        <option value="">Choose…</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}
                      </select>
                    </label>
                  ))}
                  <span className="text-xs font-semibold">Overall<span className={`mt-1 block w-24 rounded-md px-2 py-1.5 text-center text-sm font-bold ${tone(overall)}`}>{overall || '—'}</span></span>
                  <label className="min-w-[12rem] flex-1 text-xs font-semibold">Action owner and date
                    <input disabled={readOnly} className={`${field} mt-1`} value={row.owner} onChange={(e) => setRow(r.id, 'owner', e.target.value)} placeholder="e.g. Supervising pharmacist, before go-live" />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="break-inside-avoid">
        <h2 className="text-xl font-bold">3. Changeover checklist</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {PLAN.map((p) => (
            <li key={p.key}><label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" disabled={readOnly} className="mt-0.5 h-4 w-4 accent-[#54BD50]" checked={ticked(p.key)} onChange={(e) => setS((x) => ({ ...x, plan: { ...x.plan, [p.key]: e.target.checked } }))} />
              <span>{p.label}{auto[p.key] && s.plan[p.key] === undefined && <span className="ml-1.5 rounded bg-brand/15 px-1.5 text-[10px] font-bold text-brand-dark">from your account</span>}</span>
            </label></li>
          ))}
        </ul>
      </section>

      <section className="break-inside-avoid">
        <h2 className="text-xl font-bold">4. Sign-off</h2>
        <p className="mt-1 text-sm text-muted-foreground">Reviewed at least once a year, and after any significant change to the system, the premises or the way records are kept.</p>
        {mode === 'pharmacy' ? (
          signature ? (
            <div className="mt-3 flex items-start gap-3 rounded-2xl bg-brand/10 p-4 ring-1 ring-brand/30 print:rounded-none">
              <BadgeCheck className="h-6 w-6 flex-shrink-0 text-brand" />
              <div>
                <p className="font-bold">Signed electronically by {signature.name}{signature.psi ? ` (PSI ${signature.psi})` : ''}, {signature.role}</p>
                <p className="text-sm text-muted-foreground">{fmtDateTime(signature.at)}. Identified by their own PIN; this signed version can’t be changed.</p>
              </div>
            </div>
          ) : <div className="no-print mt-3">{signArea}</div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {[['sup', 'Superintendent pharmacist'], ['supv', 'Supervising pharmacist']].map(([k, label]) => (
              <div key={k} className="rounded-2xl bg-card p-4 ring-1 ring-border print:rounded-none print:ring-slate-300">
                <p className="font-semibold">{label}</p>
                {['Name', 'PSI no.', 'Date'].map((f) => (
                  <label key={f} className="mt-2 block text-xs font-semibold">{f}<input className={`${field} mt-1`} type={f === 'Date' ? 'date' : 'text'} value={s.sign[`${k}-${f}`] ?? ''} onChange={(e) => setS((x) => ({ ...x, sign: { ...x.sign, [`${k}-${f}`]: e.target.value } }))} /></label>
                ))}
                <p className="mt-4 text-xs font-semibold">Signature</p><div className="mt-6 border-b border-slate-400" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
