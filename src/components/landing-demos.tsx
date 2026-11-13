'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, ScanLine, ShieldCheck, Camera } from 'lucide-react';

/**
 * "See it in action": four small looping animations of what the dashboard does. Pure React + CSS,
 * no video. Each one only runs while it's on screen, and stays still for reduced-motion users.
 */

/** Steps through phases 0..n-1 while visible (durations in ms), then starts again. */
function usePhases(durations: number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(false);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    if (reduced.current) { setPhase(durations.length - 1); return; }
    const t = setTimeout(() => setPhase((p) => (p + 1) % durations.length), durations[phase]);
    return () => clearTimeout(t);
  }, [visible, phase, durations]);
  return { ref, phase };
}

/** A number that counts smoothly to its new value. */
function Counter({ value, className = '' }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (shown === value) return;
    const step = value > shown ? 1 : -1;
    const t = setTimeout(() => setShown((s) => s + step * Math.max(1, Math.round(Math.abs(value - s) / 6))), 35);
    return () => clearTimeout(t);
  }, [shown, value]);
  return <span className={`tabular-nums ${className}`}>{shown}</span>;
}

function Card({ title, text, children, refEl }: { title: string; text: string; children: React.ReactNode; refEl: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={refEl} className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="relative h-56 overflow-hidden bg-gradient-to-b from-secondary/70 to-background p-4" aria-hidden="true">{children}</div>
      <div className="p-5">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

const fade = (on: boolean, extra = '') => `transition-all duration-500 ease-out ${on ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'} ${extra}`;

/* 1. Running balance */
function BalanceDemo() {
  const { ref, phase } = usePhases([1400, 900, 2600, 600]);
  const added = phase >= 1 && phase <= 2;
  const rows = [
    { d: '01/11', n: 'United Drug', inQ: 112, outQ: null, b: 168 },
    { d: '02/11', n: 'Mary Kelly', inQ: null, outQ: 28, b: 140 },
  ];
  return (
    <Card refEl={ref} title="Balances that work themselves out" text="Record a supply and the running balance updates instantly. No arithmetic carried down the page.">
      <div className="overflow-hidden rounded-lg bg-white text-[11px] text-slate-800 shadow ring-1 ring-slate-200">
        <div className="grid grid-cols-[3rem_1fr_3rem_3rem_3.5rem] bg-slate-100 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-500"><span>Date</span><span>Name</span><span className="text-right">In</span><span className="text-right">Out</span><span className="text-right">Balance</span></div>
        {rows.map((r) => (
          <div key={r.n} className="grid grid-cols-[3rem_1fr_3rem_3rem_3.5rem] border-t border-slate-100 px-2 py-1.5"><span>{r.d}</span><span>{r.n}</span><span className="text-right font-semibold">{r.inQ ?? ''}</span><span className="text-right font-semibold">{r.outQ ?? ''}</span><span className="text-right font-bold">{r.b}</span></div>
        ))}
        <div className={`grid grid-cols-[3rem_1fr_3rem_3rem_3.5rem] border-t border-slate-100 px-2 py-1.5 ${fade(added, added ? 'bg-brand/10' : '')}`}>
          <span>13/11</span><span>John Murphy</span><span /><span className="text-right font-semibold">28</span>
          <span className="text-right font-bold text-brand-dark"><Counter value={added ? 112 : 140} /></span>
        </div>
      </div>
      <div className={`mt-3 flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow ring-1 ring-slate-200 ${fade(phase === 2)}`}>
        <CheckCircle2 className="h-4 w-4 text-brand" /> Signed by Aoife Byrne (PSI 12345)
      </div>
    </Card>
  );
}

/* 2. Invoice read */
function ScanDemo() {
  const { ref, phase } = usePhases([900, 1700, 2800, 500]);
  return (
    <Card refEl={ref} title="Photograph the invoice" text="Controlled drug lines are picked out and packs × pack size worked out for you to check. Nothing is recorded until you sign.">
      <div className="flex h-full gap-3">
        <div className="relative w-[44%] overflow-hidden rounded-lg bg-white p-2.5 shadow ring-1 ring-slate-200">
          <p className="text-[8px] font-bold text-slate-500">UNITED DRUG · INVOICE 4471902</p>
          {['PARACETAMOL 500MG 100', 'OXYNORM 5MG CAPS  2 × 56', 'LANSOPRAZOLE 30MG 28', 'MST CONTINUS 10MG  1 × 60', 'ORAMORPH 10MG/5ML 100ML'].map((l, i) => (
            <p key={l} className={`mt-1.5 rounded px-1 text-[8px] leading-tight transition-colors duration-500 ${phase >= 2 && (i === 1 || i === 3) ? 'bg-brand/20 font-bold text-brand-dark' : 'text-slate-500'}`}>{l}</p>
          ))}
          {phase === 1 && <span className="scan-sweep absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-brand/40 to-transparent" />}
          <Camera className={`absolute bottom-2 right-2 h-4 w-4 text-slate-400 ${phase === 0 ? 'animate-pulse' : ''}`} />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-2">
          {[{ n: 'OxyNorm 5mg capsule', q: '2 × 56 = 112' }, { n: 'MST Continus 10mg', q: '1 × 60 = 60' }].map((x, i) => (
            <div key={x.n} className={`rounded-lg bg-white p-2 text-[11px] shadow ring-1 ring-slate-200 ${fade(phase >= 2)}`} style={{ transitionDelay: `${i * 250}ms` }}>
              <p className="font-bold text-slate-800">{x.n}</p>
              <p className="text-slate-500">{x.q} <span className="ml-1 rounded-full bg-brand/15 px-1.5 text-[9px] font-bold text-brand-dark">YOUR REGISTER</span></p>
            </div>
          ))}
          <p className={`text-[10px] text-slate-500 ${fade(phase >= 2)}`} style={{ transitionDelay: '500ms' }}><ScanLine className="mr-1 inline h-3 w-3" />Oramorph 10mg/5ml: no register needed</p>
        </div>
      </div>
    </Card>
  );
}

/* 3. Reminder recorded */
function ReminderDemo() {
  const { ref, phase } = usePhases([1800, 900, 2600, 500]);
  return (
    <Card refEl={ref} title="Weekly supplies in one click" text="Set a reminder for regular patients. When it’s due, one click records it in the right register.">
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <BellRing className={`h-4 w-4 ${phase === 0 ? 'bell-ring' : ''}`} />
          <b>{phase >= 2 ? 'All done for today' : '1 dispensing reminder due'}</b>
        </div>
        <div className="rounded-xl bg-white p-3 text-xs shadow ring-1 ring-slate-200">
          <p className="font-bold text-slate-800">Thomas Burke · weekly</p>
          <p className="text-slate-500">Durogesic 25mcg/hr patch · 5 patches</p>
          <div className="mt-2.5 h-8">
            {phase < 2 ? (
              <span className={`inline-flex h-8 items-center rounded-lg bg-brand-dark px-3 font-semibold text-white transition-transform duration-200 ${phase === 1 ? 'scale-95 ring-4 ring-brand/30' : ''}`}>Record it now</span>
            ) : (
              <span className={`inline-flex h-8 items-center gap-1.5 font-semibold text-brand-dark ${fade(true)}`}><CheckCircle2 className="h-4 w-4 text-brand" /> Recorded · next due Fri 20 Nov</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* 4. Integrity check */
function IntegrityDemo() {
  const LINES = 6;
  const { ref, phase } = usePhases([700, ...Array(LINES).fill(330), 2600, 500]);
  const checked = Math.max(0, Math.min(LINES, phase));
  const done = phase > LINES && phase <= LINES + 1;
  return (
    <Card refEl={ref} title="Inspection ready, tamper-evident" text="Every line is sealed with a fingerprint. One click proves nothing has been altered, and inspectors get a read-only link.">
      <div className="flex h-full gap-4">
        <div className="flex-1 space-y-1.5 rounded-lg bg-white p-2.5 shadow ring-1 ring-slate-200">
          {Array.from({ length: LINES }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className="w-4 tabular-nums">{i + 1}</span>
              <span className="h-1.5 flex-1 rounded bg-slate-200" />
              <span className={`flex h-4 w-4 items-center justify-center rounded-full transition-all duration-300 ${i < checked ? 'scale-100 bg-brand/20' : 'scale-50 bg-transparent'}`}>
                {i < checked && <svg viewBox="0 0 24 24" className="h-3 w-3"><path d="M6 12.5l4 4L18 8" fill="none" stroke="#54BD50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
            </div>
          ))}
        </div>
        <div className="flex w-[38%] flex-col items-center justify-center text-center">
          <ShieldCheck className={`h-14 w-14 transition-all duration-500 ${done ? 'scale-110 text-brand' : 'scale-100 text-slate-300'}`} />
          <p className={`mt-2 text-xs font-bold text-brand-dark ${fade(done)}`}>Intact</p>
          <p className={`text-[10px] text-slate-500 ${fade(done)}`}>All lines verified</p>
        </div>
      </div>
    </Card>
  );
}

export function LandingDemos() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <BalanceDemo />
      <ScanDemo />
      <ReminderDemo />
      <IntegrityDemo />
    </div>
  );
}
