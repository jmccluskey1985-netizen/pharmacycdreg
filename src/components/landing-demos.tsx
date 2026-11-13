'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, ScanLine, ShieldCheck, Camera, Loader2, ImagePlus, Sparkles } from 'lucide-react';

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


/* 0. Prescription scanned with the app's camera, then recorded in the register */
const HAND = { fontFamily: '"Segoe Script","Bradley Hand","Snell Roundhand","Comic Sans MS",cursive' };
function FakeRx() {
  return (
    <div className="h-full w-full rounded-md bg-[#fffdf7] p-[7%] text-slate-800 shadow-inner">
      <div className="flex items-start justify-between border-b border-slate-300 pb-1">
        <div><p className="text-[7px] font-bold tracking-wide text-slate-600">ENNIS MEDICAL CENTRE</p><p className="text-[6px] text-slate-500">Dr A. Walsh · Reg 012345</p></div>
        <p className="text-[6px] text-slate-500">Date: 13/11/26</p>
      </div>
      <p className="mt-1.5 text-[6px] text-slate-500">Patient</p>
      <p className="text-[9px] leading-tight" style={HAND}>Mary Kelly, 14 Main St, Ennis</p>
      <p className="mt-2 text-[10px] font-bold text-slate-500">Rx</p>
      <p className="text-[10px] leading-tight" style={HAND}>OxyNorm 5mg capsules</p>
      <p className="text-[9px] leading-tight" style={HAND}>one twice daily for 14 days</p>
      <p className="mt-1 text-[9px] leading-tight" style={HAND}>Supply: twenty-eight (28)</p>
      <svg viewBox="0 0 120 30" className="mt-2 h-5 w-20"><path d="M4 22c10-18 16 6 24-6s8 10 16 2 10-14 18-2 8 8 18-4 12 6 22 2" fill="none" stroke="#1e3a8a" strokeWidth="1.6" strokeLinecap="round" /></svg>
    </div>
  );
}

function RxScanDemo() {
  const { ref, phase } = usePhases([1700, 450, 1400, 2900, 900, 3600, 900]);
  const fields = [
    { k: 'Patient', v: 'Mary Kelly · 14 Main St, Ennis' },
    { k: 'Prescriber', v: 'Dr A. Walsh (Reg 012345)' },
    { k: 'Drug', v: 'OxyNorm 5mg capsule' },
    { k: 'Quantity', v: 'twenty-eight (28)', ok: 'words and figures agree' },
  ];
  const recorded = phase >= 5;
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[minmax(0,15rem)_1fr] md:p-8" aria-hidden="true">
        {/* Phone */}
        <div className="mx-auto w-[15rem] rounded-[2.2rem] bg-slate-900 p-2 shadow-xl">
          <div className="relative h-[27rem] overflow-hidden rounded-[1.8rem] bg-black">
            {phase <= 1 && (
              <>
                {/* "camera view": the prescription on the counter, settling into the frame */}
                <div className="absolute inset-0 bg-gradient-to-br from-stone-600 to-stone-800" />
                <div className={`absolute left-1/2 top-[46%] aspect-[1/1.35] h-[62%] transition-transform duration-[1400ms] ease-out ${phase === 0 ? '-translate-x-[46%] -translate-y-[47%] rotate-[-5deg] scale-105' : '-translate-x-1/2 -translate-y-1/2 rotate-0'}`}><FakeRx /></div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-[8%]">
                  <div className="relative aspect-[1/1.35] h-[66%] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,.5)]">
                    {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl'].map((c) => <span key={c} className={`absolute h-7 w-7 border-brand ${c}`} />)}
                    <span className="demo-sweep absolute inset-x-2 h-0.5 bg-brand/80 shadow-[0_0_12px_2px_rgba(84,189,80,.7)]" />
                  </div>
                </div>
                <p className="absolute inset-x-0 top-3 mx-auto w-max rounded-full bg-black/60 px-2.5 py-1 text-[9px] font-medium text-white">Line up the prescription inside the frame</p>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white"><ImagePlus className="h-4 w-4" /></span>
                  <span className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform duration-150 ${phase === 1 ? 'scale-90' : ''}`}><span className="h-10 w-10 rounded-full bg-white" /></span>
                  <span className="block h-8 w-8" />
                </div>
                {phase === 1 && <div className="demo-flash absolute inset-0 bg-white" />}
              </>
            )}
            {phase === 2 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
                <div className="h-28 w-20 overflow-hidden rounded-md ring-2 ring-brand/40"><div className="origin-top-left scale-[.42]" style={{ width: '238%', height: '238%' }}><FakeRx /></div></div>
                <p className="flex items-center gap-2 text-xs font-semibold text-foreground"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Reading the prescription…</p>
              </div>
            )}
            {phase >= 3 && (
              <div className="flex h-full flex-col bg-background p-3 text-[10px]">
                <p className="flex items-center gap-1 text-xs font-bold text-foreground"><Sparkles className="h-3.5 w-3.5 text-brand" /> Check and sign</p>
                <div className="mt-2 space-y-1.5">
                  {fields.map((f, i) => (
                    <div key={f.k} className={`rounded-lg bg-card px-2.5 py-1.5 shadow-sm ring-1 ring-border ${fade(phase >= 3)}`} style={{ transitionDelay: phase === 3 ? `${i * 350}ms` : '0ms' }}>
                      <p className="text-[8px] uppercase tracking-wide text-muted-foreground">{f.k}</p>
                      <p className="font-semibold text-foreground">{f.v}</p>
                      {f.ok && <p className="flex items-center gap-1 text-[8px] font-semibold text-brand"><CheckCircle2 className="h-2.5 w-2.5" /> {f.ok}</p>}
                    </div>
                  ))}
                  <div className={`flex items-center justify-between rounded-lg bg-brand/10 px-2.5 py-1.5 ${fade(phase >= 3)}`} style={{ transitionDelay: phase === 3 ? '1400ms' : '0ms' }}>
                    <span className="font-semibold text-brand-dark">OxyNorm 5mg register</span><span className="rounded-full bg-brand/20 px-1.5 text-[8px] font-bold text-brand-dark">YOUR REGISTER</span>
                  </div>
                </div>
                <div className="mt-auto">
                  {phase < 5 ? (
                    <span className={`flex h-9 items-center justify-center rounded-lg bg-brand-dark text-xs font-semibold text-white transition-transform duration-150 ${phase === 4 ? 'scale-95 ring-4 ring-brand/30' : ''}`}>Sign &amp; record</span>
                  ) : (
                    <span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand/15 text-xs font-semibold text-brand-dark"><CheckCircle2 className="h-4 w-4 text-brand" /> Recorded on line 9</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Register */}
        <div className="flex min-w-0 flex-col md:pt-10">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">OxyNorm 5mg capsule · register</p>
          <div className="mt-2 overflow-x-auto rounded-lg bg-white text-[11px] text-slate-800 shadow ring-1 ring-slate-200">
            <div className="grid min-w-[26rem] grid-cols-[3.2rem_1fr_7rem_2.6rem_3.4rem] bg-slate-100 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-500"><span>Date</span><span>Supplied to</span><span>Authority</span><span className="text-right">Out</span><span className="text-right">Balance</span></div>
            {[{ d: '07/11/26', n: 'Patrick Hayes', a: 'Rx: Dr A. Walsh', q: 14, b: 112 }, { d: '11/11/26', n: 'Seán O’Brien', a: 'Rx: Dr L. Nolan', q: 14, b: 98 }].map((r) => (
              <div key={r.n} className="grid min-w-[26rem] grid-cols-[3.2rem_1fr_7rem_2.6rem_3.4rem] border-t border-slate-100 px-3 py-2"><span>{r.d}</span><span>{r.n}</span><span className="truncate text-slate-500">{r.a}</span><span className="text-right font-semibold">{r.q}</span><span className="text-right font-bold">{r.b}</span></div>
            ))}
            <div className={`grid min-w-[26rem] grid-cols-[3.2rem_1fr_7rem_2.6rem_3.4rem] border-t border-slate-100 px-3 py-2 transition-all duration-700 ease-out ${recorded ? 'max-h-16 translate-x-0 bg-brand/10 opacity-100' : 'max-h-0 -translate-x-6 py-0 opacity-0'}`}>
              <span>13/11/26</span>
              <span>Mary Kelly <span className="ml-1 rounded-full bg-brand/20 px-1.5 text-[8px] font-bold text-brand-dark">scanned</span><span className="block text-[9px] text-slate-500">14 Main St, Ennis</span></span>
              <span className="truncate text-slate-500">Rx: Dr A. Walsh</span>
              <span className="text-right font-semibold">28</span>
              <span className="text-right font-bold text-brand-dark"><Counter value={recorded ? 70 : 98} /></span>
            </div>
            <div className="min-w-[26rem] border-t border-dashed border-slate-200 px-3 py-2 text-[10px] text-slate-400">+ Add the next entry here</div>
          </div>
          <p className={`mt-3 flex items-center gap-2 text-sm font-semibold text-brand-dark ${fade(recorded)}`}><CheckCircle2 className="h-4 w-4 text-brand" /> Signed by Aoife Byrne (PSI 12345) · balance 70 capsules</p>
          <h3 className="mt-6 text-2xl font-bold">Scan a prescription, sign, done</h3>
          <p className="mt-1 max-w-lg text-muted-foreground">Photograph the prescription with the app. The patient, prescriber, drug and quantity are read for you to check, and one tap writes the line into the right register with the balance worked out.</p>
        </div>
      </div>
    </div>
  );
}


/* Invoice photographed: a real wholesaler invoice (customer details replaced), CD lines read */
function InvoiceDemo() {
  const { ref, phase } = usePhases([1300, 1900, 2900, 800, 3200, 700]);
  const lines = [
    { top: '78.6%', cd: false },
    { top: '83.2%', cd: false },
    { top: '86.9%', cd: true },
  ];
  const recorded = phase >= 4;
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[minmax(0,1.35fr)_1fr] md:p-8" aria-hidden="true">
        <div className="relative self-start overflow-hidden rounded-xl shadow-xl ring-1 ring-black/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/previews/invoice-photo.webp" alt="" loading="lazy" className="block w-full" />
          {phase === 1 && <span className="demo-sweep absolute inset-x-0 h-1 bg-brand/80 shadow-[0_0_16px_4px_rgba(84,189,80,.6)]" />}
          {phase === 0 && <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white"><Camera className="h-3.5 w-3.5" /> Photo taken</span>}
          {phase >= 2 && lines.map((l, i) => (
            <span key={i} className={`absolute left-[6%] w-[90%] rounded transition-all duration-500 ${l.cd ? 'bg-brand/25 ring-2 ring-brand' : 'bg-slate-400/15 ring-1 ring-slate-400/50'}`}
              style={{ top: l.top, height: '4.6%', transform: 'rotate(-2.4deg)', transformOrigin: 'left center', transitionDelay: `${i * 200}ms` }} />
          ))}
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Read from the invoice</p>
          <div className={`mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700 shadow ring-1 ring-slate-200 ${fade(phase >= 2)}`}>
            <b>Uniphar</b> · Invoice <b>0974471902</b> · 05/11/2026 <span className="block text-[10px] text-slate-500">Invoice number used, not the account number. Already-recorded invoices are caught.</span>
          </div>
          <div className={`mt-2 rounded-lg bg-white p-3 text-sm shadow ring-2 ring-brand/60 ${fade(phase >= 2)}`} style={{ transitionDelay: '250ms' }}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-bold text-slate-800">OxyNorm 5mg capsule</p><p className="text-xs text-slate-500">2 packs × 56 = <b className="text-slate-800">112 capsules</b></p></div>
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand-dark">YOUR REGISTER</span>
            </div>
            <div className="mt-2 h-8">
              {!recorded ? (
                <span className={`flex h-8 items-center justify-center rounded-lg bg-brand-dark text-xs font-semibold text-white transition-transform duration-150 ${phase === 3 ? 'scale-95 ring-4 ring-brand/30' : ''}`}>Check details &amp; record</span>
              ) : (
                <span className="flex h-8 items-center gap-1.5 text-xs font-semibold text-brand-dark"><CheckCircle2 className="h-4 w-4 text-brand" /> Received: balance <Counter value={recorded ? 182 : 70} className="mx-0.5" /> capsules</span>
              )}
            </div>
          </div>
          <ul className={`mt-2 space-y-1 text-xs text-slate-500 ${fade(phase >= 2)}`} style={{ transitionDelay: '500ms' }}>
            <li className="flex items-center gap-1.5"><ScanLine className="h-3.5 w-3.5" /> Lycimor (pregabalin) 300mg: no register entry needed</li>
            <li className="flex items-center gap-1.5"><ScanLine className="h-3.5 w-3.5" /> NovoRapid FlexPen: not a controlled drug</li>
          </ul>
          <h3 className="mt-6 text-2xl font-bold">Photograph the wholesaler invoice</h3>
          <p className="mt-1 text-muted-foreground">Uniphar, United Drug, PCO and others. Controlled drug lines are picked out, packs × pack size worked out and matched to the right register for you to check. Nothing is recorded until you sign.</p>
        </div>
      </div>
    </div>
  );
}

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
    <div className="space-y-6">
      <div className="grid gap-6"><RxScanDemo /></div>
      <InvoiceDemo />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <BalanceDemo />
        <ReminderDemo />
        <IntegrityDemo />
      </div>
    </div>
  );
}
