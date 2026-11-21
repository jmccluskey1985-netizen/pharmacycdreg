'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, Loader2, BadgeCheck, PenLine, History, FileWarning } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { RiskForm, type Signature } from '@/components/risk-form';
import { freshRisk, PLAN, type RiskState } from '@/lib/risk-assessment';

interface Version { id: string; data: RiskState; status: string; signed_by_name: string | null; signed_by_psi: string | null; signed_by_role: string | null; signed_at: string | null }
interface Data { prefill: { head: Record<string, string>; plan: Record<string, boolean> }; draft: Version | null; signed: Version | null; versions: { id: string; signed_at: string; signed_by_name: string }[]; can_sign: boolean; me: { name: string; psi: string | null; role: string } }
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Dublin' });

/**
 * The pharmacy's own risk assessment for the electronic register: filled in from the account,
 * saved as you edit, signed by the superintendent or supervising pharmacist with one click
 * (they're already identified by their PIN), printable at any time.
 */
export default function RiskAssessmentPage() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [saved, setSaved] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [signing, setSigning] = useState(false);
  const latest = useRef<RiskState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => api('/api/risk-assessment').then((x: Data) => { setD(x); setMode(x.signed && !x.draft ? 'view' : 'edit'); }).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load')), []);
  useEffect(() => { load(); }, [load]);

  const onChange = useCallback((s: RiskState) => {
    latest.current = s;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api('/api/risk-assessment', { method: 'PUT', json: { data: s } }).then((r) => setSaved(r.saved_at)).catch(() => setSaved(null));
    }, 800);
  }, []);

  if (error) return <p className="card p-4 text-sm text-destructive">{error}</p>;
  if (!d) return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparing your risk assessment…</p>;

  const startData: RiskState = d.draft?.data ?? (d.signed && mode === 'edit' ? { ...d.signed.data, head: { ...d.signed.data.head, ...d.prefill.head, assessor: d.signed.data.head.assessor || d.prefill.head.assessor } } : freshRisk(d.prefill.head));
  const withAuto = (s: RiskState) => ({ ...s, plan: Object.fromEntries(PLAN.map((p) => [p.key, s.plan[p.key] ?? d.prefill.plan[p.key] ?? false])) });
  const sig = (v: Version | null): Signature | null => (v?.signed_at ? { name: v.signed_by_name ?? '', psi: v.signed_by_psi, role: v.signed_by_role ?? '', at: v.signed_at } : null);

  async function sign() {
    setSigning(true);
    try {
      const data = withAuto(latest.current ?? startData);
      await api('/api/risk-assessment/sign', { method: 'POST', json: { data: { ...data, plan: { ...data.plan, assessment: true } }, confirm: true } });
      setConfirm(false); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not sign'); }
    finally { setSigning(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Risk assessment</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">PSI guidance expects a risk assessment before using electronic records. This one is filled in from your account with suggested answers: check it, change anything that’s different for your pharmacy, and sign it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'view' && d.signed ? <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-sm font-semibold text-brand-dark"><BadgeCheck className="h-4 w-4" /> Signed {fmt(d.signed.signed_at!)}</span>
            : <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900"><FileWarning className="h-4 w-4" /> {d.signed ? 'Updating: not signed yet' : 'Not signed yet'}</span>}
          <button onClick={() => window.print()} className="btn-secondary"><Printer className="h-4 w-4" /> Print or PDF</button>
          {mode === 'view' && d.can_sign && <button onClick={() => setMode('edit')} className="btn-primary"><PenLine className="h-4 w-4" /> Review and update</button>}
        </div>
      </div>
      {mode === 'edit' && d.can_sign && <p className="no-print text-xs text-muted-foreground">{saved ? `Saved ${new Date(saved).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}` : 'Changes are saved as you type.'}</p>}
      {!d.can_sign && <p className="no-print rounded-xl bg-secondary p-3 text-sm">Your superintendent or supervising pharmacist reviews and signs this. You can read and print it.</p>}

      <div className="print-only mb-4 hidden print:block">
        <p className="text-2xl font-extrabold">Risk assessment: electronic Controlled Drugs Register</p>
        <p className="text-sm">{d.prefill.head.pharmacy}</p>
      </div>

      <div className="rounded-3xl bg-background p-1 print:p-0">
        <RiskForm key={`${mode}-${d.signed?.id ?? 'none'}`} mode="pharmacy"
          initial={mode === 'view' && d.signed ? d.signed.data : startData}
          readOnly={mode === 'view' || !d.can_sign}
          auto={mode === 'view' ? {} : d.prefill.plan}
          onChange={mode === 'edit' && d.can_sign ? onChange : undefined}
          signature={mode === 'view' ? sig(d.signed) : null}
          signArea={d.can_sign ? (
            <div className="space-y-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-border">
              <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#54BD50]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                <span>I’ve reviewed this risk assessment, and it reflects how our pharmacy keeps its Controlled Drugs Register electronically.</span></label>
              <button onClick={sign} disabled={!confirm || signing} className="btn-primary w-full sm:w-auto">{signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Sign as {d.me.name}{d.me.psi ? ` (PSI ${d.me.psi})` : ''}</button>
              <p className="text-xs text-muted-foreground">You’re signed in with your own PIN, so this records your name, PSI number and the time. The signed version can’t be changed; a later review starts a new version.</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">To be signed by the superintendent or supervising pharmacist.</p>}
        />
      </div>

      {d.versions.length > 0 && (
        <details className="no-print card p-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold"><History className="h-4 w-4" /> Signed versions ({d.versions.length})</summary>
          <ul className="mt-2 space-y-0.5 pl-6 text-muted-foreground">{d.versions.map((v) => <li key={v.id}>{fmt(v.signed_at)}: {v.signed_by_name}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
