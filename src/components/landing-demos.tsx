'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, ScanLine, ShieldCheck, Camera, Loader2, ImagePlus, Sparkles } from 'lucide-react';

/**
 * "See it in action": four small looping animations of what the dashboard does. Pure React + CSS,
 * no video. Each one only runs while it's on screen. They play on every computer (including ones
 * with Windows animations turned off) because the owner wants them seen; the movement is gentle.
 */

/** Steps through phases 0..n-1 while visible (durations in ms), then starts again. */
export function usePhases(durations: number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
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

/** Under every illustration: the people, pharmacies and prescriptions shown are made up. */
export function SampleNote({ className = '' }: { className?: string }) {
  return <p className={`text-[11px] leading-snug text-muted-foreground/80 ${className}`}>Illustration only. Patient, prescriber and pharmacy details are fictitious; any resemblance to real people is coincidental.</p>;
}

function Card({ title, text, children, refEl }: { title: string; text: string; children: React.ReactNode; refEl: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={refEl} className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="relative h-56 overflow-hidden bg-gradient-to-b from-secondary/70 to-background p-4" aria-hidden="true">{children}</div>
      <div className="p-5">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
        <SampleNote className="mt-2" />
      </div>
    </div>
  );
}

const fade = (on: boolean, extra = '') => `transition-all duration-500 ease-out ${on ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'} ${extra}`;


/* 0. Prescription scanned with the app's camera, then recorded in the register */
export const HAND = { fontFamily: '"Segoe Script","Bradley Hand","Snell Roundhand","Comic Sans MS",cursive' };
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
          <SampleNote className="mt-2" />
        </div>
      </div>
    </div>
  );
}


/* OST (methadone) form: laid out like the purple HSE form (GMS010-8082), its dispensing grid read,
   today's instalment recorded. Every name, address and number here is made up. */
const OST_DAYS = ['MON', 'TUES', 'WED', 'THURS', 'FRI', 'SAT', 'SUN'];
function OstTick({ on }: { on?: boolean }) {
  return <span className="relative inline-block h-[6px] w-[6px] flex-shrink-0 border border-[#6f5d96] bg-white">{on && <span className="absolute -top-[3px] left-[1px] text-[7px] leading-none text-slate-900" style={HAND}>✓</span>}</span>;
}
function OstDays({ on }: { on: string[] }) {
  return (
    <span className="inline-flex flex-col items-end">
      <span className="flex">{OST_DAYS.map((d) => <span key={d} className="relative h-[6px] w-[7px] border border-[#6f5d96] bg-white">{on.includes(d) && <span className="absolute -top-[3px] left-[1px] text-[7px] leading-none text-slate-900" style={HAND}>✓</span>}</span>)}</span>
      <span className="flex text-[2.2px] text-[#4a3a6e]">{OST_DAYS.map((d) => <span key={d} className="w-[7px] text-center">{d}</span>)}</span>
    </span>
  );
}
function FakeOstForm() {
  const L = 'text-[3.2px] font-semibold uppercase tracking-tight text-[#4a3a6e]';
  const box = 'border border-[#6f5d96] bg-white';
  const hand = (sz = 6.5) => ({ ...HAND, fontSize: `${sz}px`, lineHeight: 1 });
  const rows: [string, string, string][] = [['15 11 26', '75 (S)', 'AB'], ['16 11 26', '75 (S)', 'AB'], ['16 11 26', '300 (TA)', 'AB']];
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[3px] bg-[#c6b9da] text-slate-800 shadow-md">
      {/* Title and numbers */}
      <div className="flex items-start justify-between gap-1 px-1 pt-1">
        <p className="flex items-center gap-[2px] rounded-[1px] bg-[#45366a] px-1 py-[2px] text-[4.2px] font-extrabold leading-[1.1] tracking-wide text-white"><span className="h-[4px] w-[4px] rounded-full bg-white" />OPIOID SUBSTITUTION TREATMENT<br />PRESCRIPTION FORM</p>
        <div className="flex gap-1">
          <div><p className={L}>Pharmacy sequence no.</p><p className={`${box} relative h-[9px] w-[30px]`}><span className="absolute left-[9px] top-[-1px] rounded-full border border-slate-800 px-[2px]" style={hand(6)}>24</span></p></div>
          <div><p className={L}>Serial no.</p><p className={`${box} h-[9px] w-[30px] text-center font-mono text-[6px] font-bold leading-[8px]`}>9000024</p></div>
        </div>
      </div>
      {/* Patient details */}
      <div className="mt-[2px] grid grid-cols-[1fr_1fr_1fr] gap-1 px-1">
        <div>
          <p className={L}>Patient details</p>
          <div className="flex items-center gap-[2px]"><span className={`${L} w-[14px]`}>Surname</span><span className={`${box} h-[7px] flex-1 pl-[2px]`} style={hand(6.5)}>Farrell</span></div>
          <div className="mt-[1px] flex items-center gap-[2px]"><span className={`${L} w-[14px]`}>First name</span><span className={`${box} h-[7px] flex-1 pl-[2px]`} style={hand(6.5)}>Declan</span></div>
        </div>
        <div className="flex gap-[2px]"><span className={L}>Address</span><span className={`${box} flex-1 px-[2px] pt-[1px]`} style={hand(5)}>12 Abbey Court<br />Ennis<br />Co. Clare</span></div>
        <div>
          <div className="flex items-center justify-between"><span className={L}>Patient’s age if under 12 years</span><span className={`${box} h-[5px] w-[10px]`} /></div>
          <div className="mt-[2px] flex items-center justify-between gap-[2px]"><span className={L}>Treatment card no.</span><span className={`${box} h-[7px] w-[34px] whitespace-nowrap pl-[1px] font-mono text-[5px] font-bold leading-[6px]`}>PH <span style={hand(5.5)}>4417</span></span></div>
        </div>
      </div>
      {/* Prescription details + instructions */}
      <div className="mt-[3px] grid grid-cols-[1.08fr_1fr] gap-[3px] px-1">
        <div className="space-y-[2px] border border-[#8f80b0] bg-[#e7ece8] p-[2px]">
          <div className="flex gap-[2px]">
            <div><p className={L}>Prescription details</p><p className={L}>Date prescribed</p><p className={`${box} h-[7px] w-[22px] whitespace-nowrap pl-[1px]`} style={hand(4.4)}>14 11 26</p></div>
            <div className="flex-1"><p className={L}>Drug name, form and strength</p><p className={`${box} min-h-[11px] px-[2px] pt-[1px]`} style={hand(4.4)}>Methadone DTF 1mg/ml oral solution</p></div>
          </div>
          <div className="grid grid-cols-5 border border-[#6f5d96] bg-white text-center">
            {[['From', '15 11 26'], ['To', '21 11 26'], ['Dosage (qty per day)', '75'], ['No. of days at dose', '7'], ['Total (qty) in figures', '525']].map(([k, v], i) => (
              <div key={k} className={i ? 'border-l border-[#6f5d96]' : ''}><p className="bg-[#e7ece8] text-[2.6px] font-semibold uppercase leading-[1.05] text-[#4a3a6e]">{k}</p><p className="h-[7px] whitespace-nowrap" style={hand(v.length > 3 ? 4.2 : 5.5)}>{v}</p></div>
            ))}
          </div>
          <div className="flex items-end gap-[2px]"><span className={L}>Total in words</span><span className="flex-1 whitespace-nowrap border-b border-[#6f5d96]" style={hand(4.8)}>five hundred &amp; twenty five</span></div>
          <p className="text-[2.3px] italic text-[#4a3a6e]">(NOT MORE THAN 7 DAYS SUPPLY SHOULD BE PRESCRIBED EXCEPT IN EXCEPTIONAL CIRCUMSTANCES)</p>
          <div className="flex items-end gap-[2px]"><span className={`${L} w-[20px]`}>Doctor’s signature</span><span className="flex-1 border-b border-[#6f5d96]" style={hand(6)}>ABrennan</span></div>
          <div className="flex items-center gap-[2px]"><span className={`${L} w-[20px]`}>Registration no.</span><span className={`${box} h-[6px] w-[30px] pl-[1px]`} style={hand(5)}>0 0 0 1 2 3</span></div>
          <div className="flex items-center gap-[2px]"><span className={`${L} w-[20px]`}>Doctor’s GMS no.</span><span className={`${box} h-[6px] w-[26px] pl-[1px]`} style={hand(5)}>0 0 9 9 9</span></div>
          <p className={L}>Doctor’s name, address and telephone number or stamp</p>
          <p className={`${box} h-[12px] px-[3px]`} style={hand(4.6)}>Dr Aoife Brennan<br />Sample Health Centre, Ennis</p>
        </div>
        <div className="space-y-[2px] border border-[#8f80b0] bg-[#e7ece8] p-[2px]">
          <div className="grid grid-cols-2 gap-[2px]">
            <div className="space-y-[1px]">
              <p className="text-[3px] font-bold uppercase leading-tight text-[#2f2547]">Opioid substitution treatment</p>
              {[['Methadone', true], ['Buprenorphine', false], ['Buprenorphine/naloxone', false]].map(([k, on]) => <p key={k as string} className="flex items-center gap-[2px] text-[3px] uppercase text-[#2f2547]"><OstTick on={on as boolean} />{k}</p>)}
            </div>
            <div className="space-y-[1px]">
              <p className="text-[3px] font-bold uppercase leading-tight text-[#2f2547]">Opioid overdose therapy (for emergency use only)</p>
              <p className="flex items-center gap-[2px] text-[3px] uppercase text-[#2f2547]"><OstTick />Naloxone nasal spray</p>
            </div>
          </div>
          <p className="text-[3.2px] font-bold uppercase text-[#2f2547]">Instalment instructions</p>
          <p className={L}>Intervals</p>
          <p className="flex items-center justify-between text-[3px] uppercase text-[#2f2547]">Daily <OstTick /></p>
          <p className="flex items-center justify-between text-[3px] uppercase text-[#2f2547]">Daily (with double on Sat.) <OstTick /></p>
          <p className="flex items-center justify-between text-[3px] uppercase text-[#2f2547]">Other (tick) <OstDays on={['MON', 'SAT', 'SUN']} /></p>
          <p className="pt-[1px] text-[3.2px] font-bold uppercase text-[#2f2547]">Supervision instructions</p>
          <p className="flex items-center justify-between text-[3px] uppercase text-[#2f2547]">Supervised <span className="flex gap-[1px] text-[2.4px]">YES<OstTick on />NO<OstTick /></span></p>
          <p className="flex items-center justify-between text-[3px] uppercase text-[#2f2547]">Daily <OstTick /></p>
          <p className="flex items-center justify-between text-[3px] uppercase text-[#2f2547]">Days for supervision <OstDays on={['MON', 'SAT', 'SUN']} /></p>
          <p className="flex items-center justify-between text-[2.6px] uppercase text-[#2f2547]">Double dose every second day (bup./naloxone only) <OstTick /></p>
          <p className="flex items-center justify-between text-[2.6px] uppercase text-[#2f2547]">Additional bank holiday supply <OstTick /></p>
        </div>
      </div>
      {/* Pharmacy section */}
      <div className="mt-[3px] flex-1 bg-[#b3a4cc] px-1 pb-1 pt-[2px]">
        <div className="flex items-end gap-[3px]">
          <span className="text-[3.4px] font-bold uppercase text-[#2f2547]">Pharmacy section</span>
          <span className={L}>Pharmacy GMS no.</span><span className={`${box} h-[6px] w-[20px] pl-[1px]`} style={hand(4.5)}>0 0 0 0</span>
        </div>
        <div className="mt-[2px] grid grid-cols-[1.08fr_1fr] gap-[3px]">
          <div>
            <div className="grid grid-cols-[1fr_1fr_1fr_0.6fr] gap-[2px]">
              <div><p className={L}>Drug code</p><p className={`${box} h-[7px] pl-[1px] tracking-[1.5px]`} style={hand(5.5)}>46115</p></div>
              <div><p className={L}>Quantity</p><p className={`${box} h-[7px] text-center`} style={hand(5.5)}>525</p></div>
              <div><p className={L}>No. of instalments</p><p className={`${box} h-[7px] text-center`} style={hand(5.5)}>3</p></div>
              <div><p className={L}>Days sup.</p><p className={`${box} h-[7px] text-center`} style={hand(5.5)}>3</p></div>
            </div>
            <div className="mt-[2px] grid grid-cols-[1fr_1fr_0.7fr] text-[3px] font-semibold uppercase text-[#4a3a6e]"><span>Date dispensed</span><span>Quantity</span><span>Pharmacist’s initials</span></div>
            <div className="border border-[#6f5d96] bg-white">
              {Array.from({ length: 4 }, (_, i) => rows[i] ?? ['', '', '']).map(([d, q, n], i) => (
                <div key={i} className="grid h-[7px] grid-cols-[1fr_1fr_0.7fr] whitespace-nowrap border-t border-[#8f80b0] first:border-t-0">
                  <span className="pl-[1px]" style={hand(4.5)}>{d}</span>
                  <span className="border-l border-[#8f80b0] pl-[2px]" style={hand(5.5)}>{q}</span>
                  <span className="border-l border-[#8f80b0] pl-[2px]" style={hand(5.5)}>{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <p className={L}>Pharmacy name &amp; address stamp</p>
            <div className="flex h-[22px] items-center justify-center bg-white">
              <div className="rotate-[-3deg] border border-slate-700 px-[3px] py-[1px] text-center font-semibold leading-[1.15] text-slate-700">
                <p className="text-[3.6px] font-bold">Sample Pharmacy</p>
                <p className="text-[3px]">Main Street, Ennis</p>
                <p className="text-[4.2px] font-bold tracking-wider">15 NOV 2026</p>
              </div>
            </div>
            <p className="mt-[3px] text-[2.6px] uppercase text-[#2f2547]">I verify that I have dispensed the item(s) specified hereon</p>
            <p className="flex items-end gap-[2px] text-[2.6px] uppercase text-[#2f2547]">Pharmacist’s signature <span className="flex-1 border-b border-[#6f5d96]" style={hand(5.5)}>ABurke</span></p>
            <p className="mt-[2px] text-[2.6px] uppercase text-[#2f2547]">I verify that I have received the item(s) specified hereon</p>
            <p className="flex items-end gap-[2px] text-[2.6px] uppercase text-[#2f2547]">Signature <span className="flex-1 border-b border-[#6f5d96]" style={hand(5.5)}>D Farrell</span></p>
          </div>
        </div>
      </div>
      {/* Footer */}
      <div className="bg-[#ece9e1] px-1 py-[2px]">
        <p className="text-[2.8px] font-bold uppercase text-[#2f2547]">To be completed in the case of non-opiate dependent person (for methadone use only)</p>
        <p className="text-[2.2px] text-[#4a3a6e]">Sample form for illustration · details are fictional</p>
      </div>
    </div>
  );
}

function OstScanDemo() {
  const { ref, phase } = usePhases([1700, 450, 1400, 3200, 900, 3600, 900]);
  const fields = [
    { k: 'Patient', v: 'Declan Farrell · 12 Abbey Ct, Ennis', ok: 'matched by treatment card PH 4417' },
    { k: 'Script', v: 'Methadone DTF 1mg/ml · 75 a day × 7 = 525', ok: 'words and figures agree' },
    { k: 'Dispensed today', v: '75 supervised + 300 take-away = 375 ml' },
    { k: 'Earlier on this form', v: '15/11: 75 supervised · already in the register' },
  ];
  const recorded = phase >= 5;
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[1fr_minmax(0,15rem)] md:p-8" aria-hidden="true">
        {/* Register */}
        <div className="order-2 flex min-w-0 flex-col md:order-1 md:pt-10">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Methadone DTF 1mg/ml oral solution · register (ml)</p>
          <div className="mt-2 overflow-x-auto rounded-lg bg-white text-[11px] text-slate-800 shadow ring-1 ring-slate-200">
            <div className="grid min-w-[26rem] grid-cols-[3.2rem_1fr_7rem_2.6rem_3.4rem] bg-slate-100 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-500"><span>Date</span><span>Supplied to</span><span>Authority</span><span className="text-right">Out</span><span className="text-right">Balance</span></div>
            {[{ d: '15/11/26', n: 'Declan Farrell', a: 'OST 9000024', q: 75, b: 4580 }].map((r) => (
              <div key={r.d} className="grid min-w-[26rem] grid-cols-[3.2rem_1fr_7rem_2.6rem_3.4rem] border-t border-slate-100 px-3 py-2"><span>{r.d}</span><span>{r.n}<span className="block text-[9px] text-slate-500">75 supervised</span></span><span className="truncate text-slate-500">{r.a}</span><span className="text-right font-semibold">{r.q}</span><span className="text-right font-bold">{r.b}</span></div>
            ))}
            <div className={`grid min-w-[26rem] grid-cols-[3.2rem_1fr_7rem_2.6rem_3.4rem] border-t border-slate-100 px-3 py-2 transition-all duration-700 ease-out ${recorded ? 'max-h-16 translate-x-0 bg-brand/10 opacity-100' : 'max-h-0 -translate-x-6 py-0 opacity-0'}`}>
              <span>16/11/26</span>
              <span>Declan Farrell <span className="ml-1 rounded-full bg-violet-100 px-1.5 text-[8px] font-bold text-violet-900">OST</span><span className="block text-[9px] text-slate-500">75 supervised + 300 take-away</span></span>
              <span className="truncate text-slate-500">OST 9000024</span>
              <span className="text-right font-semibold">375</span>
              <span className="text-right font-bold text-brand-dark"><Counter value={recorded ? 4205 : 4580} /></span>
            </div>
            <div className="min-w-[26rem] border-t border-dashed border-slate-200 px-3 py-2 text-[10px] text-slate-400">+ Add the next entry here</div>
          </div>
          <p className={`mt-3 flex items-center gap-2 text-sm font-semibold text-brand-dark ${fade(recorded)}`}><CheckCircle2 className="h-4 w-4 text-brand" /> 450 of 525 dispensed on this form · 75 left</p>
          <h3 className="mt-6 text-2xl font-bold">Methadone and buprenorphine forms, instalment by instalment</h3>
          <p className="mt-1 max-w-lg text-muted-foreground">Photograph the purple OST form. Today’s supervised dose and take-away are read from the dispensing grid and recorded as one supply in the right methadone register. The form is kept, so every later day is checked against the total, and missed days are flagged.</p>
          <SampleNote className="mt-2" />
        </div>

        {/* Phone */}
        <div className="order-1 mx-auto w-[15rem] rounded-[2.2rem] bg-slate-900 p-2 shadow-xl md:order-2">
          <div className="relative h-[27rem] overflow-hidden rounded-[1.8rem] bg-black">
            {phase <= 1 && (
              <>
                <div className="absolute inset-0 bg-gradient-to-br from-stone-600 to-stone-800" />
                <div className={`absolute left-1/2 top-[46%] aspect-[1/1.3] h-[56%] transition-transform duration-[1400ms] ease-out ${phase === 0 ? '-translate-x-[46%] -translate-y-[47%] rotate-[4deg] scale-105' : '-translate-x-1/2 -translate-y-1/2 rotate-0'}`}><FakeOstForm /></div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-[8%]">
                  <div className="relative aspect-[1/1.3] h-[60%] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,.5)]">
                    {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl'].map((c) => <span key={c} className={`absolute h-7 w-7 border-brand ${c}`} />)}
                    <span className="demo-sweep absolute inset-x-2 h-0.5 bg-brand/80 shadow-[0_0_12px_2px_rgba(84,189,80,.7)]" />
                  </div>
                </div>
                <p className="absolute inset-x-0 top-3 mx-auto w-max rounded-full bg-black/60 px-2.5 py-1 text-[9px] font-medium text-white">Line up the OST form inside the frame</p>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
                  <span className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform duration-150 ${phase === 1 ? 'scale-90' : ''}`}><span className="h-10 w-10 rounded-full bg-white" /></span>
                </div>
                {phase === 1 && <div className="demo-flash absolute inset-0 bg-white" />}
              </>
            )}
            {phase === 2 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
                <div className="h-28 w-20 overflow-hidden rounded-md ring-2 ring-brand/40"><div className="origin-top-left scale-[.42]" style={{ width: '238%', height: '238%' }}><FakeOstForm /></div></div>
                <p className="flex items-center gap-2 text-xs font-semibold text-foreground"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Reading the OST form…</p>
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
                </div>
                <div className="mt-auto">
                  {phase < 5 ? (
                    <span className={`flex h-9 items-center justify-center rounded-lg bg-brand-dark text-xs font-semibold text-white transition-transform duration-150 ${phase === 4 ? 'scale-95 ring-4 ring-brand/30' : ''}`}>Sign &amp; record 375 ml</span>
                  ) : (
                    <span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand/15 text-xs font-semibold text-brand-dark"><CheckCircle2 className="h-4 w-4 text-brand" /> Recorded on line 3</span>
                  )}
                </div>
              </div>
            )}
          </div>
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
          <SampleNote className="mt-2" />
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


/* Copy last week's lines to today (Repeat for today) */
function RepeatDemo() {
  const { ref, phase } = usePhases([1100, 450, 450, 450, 1000, 3200, 600]);
  const last = [
    { n: 'Thomas Burke', q: 7 },
    { n: 'Mary Kelly', q: 14 },
    { n: 'Seán O’Brien', q: 7 },
  ];
  const selected = Math.max(0, Math.min(3, phase - 0)); // rows 1..3 get selected in phases 1-3
  const copied = phase >= 5;
  const start = 140;
  const after = start - last.reduce((n, r) => n + r.q, 0);
  return (
    <Card refEl={ref} title="Copy last week’s lines to today" text="Select a few lines from last week, press Repeat for today, add the new prescription numbers and sign. Done for every regular patient at once.">
      <div className="relative overflow-hidden rounded-lg bg-white text-[11px] text-slate-800 shadow ring-1 ring-slate-200">
        <div className="grid grid-cols-[3rem_1fr_2.5rem_3rem] bg-slate-100 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-500"><span>Date</span><span>Supplied to</span><span className="text-right">Out</span><span className="text-right">Bal.</span></div>
        {last.map((r, i) => (
          <div key={r.n} className={`grid grid-cols-[3rem_1fr_2.5rem_3rem] border-t border-slate-100 px-2 py-1 transition-colors duration-200 ${phase >= 1 && phase <= 4 && i < selected ? 'bg-brand/15 outline outline-2 -outline-offset-2 outline-brand' : ''}`}>
            <span>06/11</span><span>{r.n}</span><span className="text-right font-semibold">{r.q}</span><span className="text-right">{start + 28 - last.slice(0, i + 1).reduce((n, x) => n + x.q, 0)}</span>
          </div>
        ))}
        {last.map((r, i) => (
          <div key={r.n + 'new'} className={`grid grid-cols-[3rem_1fr_2.5rem_3rem] border-t border-slate-100 px-2 transition-all duration-500 ease-out ${copied ? 'max-h-8 py-1 opacity-100 bg-brand/10' : 'max-h-0 py-0 opacity-0'}`} style={{ transitionDelay: copied ? `${i * 220}ms` : '0ms' }}>
            <span className="font-semibold">13/11</span><span>{r.n}</span><span className="text-right font-semibold">{r.q}</span><span className="text-right font-bold text-brand-dark">{i === 2 ? <Counter value={copied ? after : start} /> : start - last.slice(0, i + 1).reduce((n, x) => n + x.q, 0)}</span>
          </div>
        ))}
      </div>
      <div className="relative mt-2 h-7">
        <div className={`absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[10px] text-white shadow-lg transition-all duration-300 ${phase >= 2 && phase <= 4 ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          <span className="font-semibold">{Math.max(1, selected)} selected</span>
          <span className={`rounded-full bg-brand px-2 py-0.5 font-semibold transition-transform duration-150 ${phase === 4 ? 'scale-90 ring-2 ring-white/40' : ''}`}>Repeat for today</span>
        </div>
        <p className={`absolute inset-x-0 top-0 flex items-center gap-1.5 text-xs font-semibold text-brand-dark ${fade(copied)}`} style={{ transitionDelay: copied ? '700ms' : '0ms' }}><CheckCircle2 className="h-4 w-4 text-brand" /> 3 supplies recorded for today</p>
      </div>
    </Card>
  );
}

/* 3. Reminder recorded */
function ReminderDemo() {
  const { ref, phase } = usePhases([1800, 900, 2600, 500]);
  return (
    <Card refEl={ref} title="Weekly dispensing, registered in one click" text="Set a reminder for regular weekly patients. When it’s due, one click writes the supply into the right register.">
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


/* Stock check against a dispensing-system report: two supplies missing from the register are
   found, ticked and added (one as a late entry with its footnote), and the balance meets the count.
   Every name, number and pharmacy here is made up. */
function StockReportDemo() {
  const { ref, phase } = usePhases([1800, 1700, 1200, 2600, 1700, 900, 3800, 600]);
  const REPORT = [
    { d: '02/11/26', n: 'United Drug', q: '+112', ok: 'line 2' },
    { d: '05/11/26', n: 'Mary Kelly', q: '−28', ok: 'line 3' },
    { d: '07/11/26', n: 'John Murphy', q: '−28', ok: 'line 4' },
    { d: '12/11/26', n: 'Paddy Hehir', q: '−14', miss: 'late' },
    { d: '14/11/26', n: 'Seán O’Brien', q: '−28', ok: 'line 5' },
    { d: '15/11/26', n: 'Niamh Corcoran', q: '−14', miss: 'new' },
  ];
  const read = phase >= 3;
  const added = phase >= 6;
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[minmax(0,17rem)_1fr] md:p-8" aria-hidden="true">
        {/* The report (paper / PDF from the dispensing system) */}
        <div className="relative mx-auto w-full max-w-[17rem]">
          <div className={`relative overflow-hidden rounded-md bg-white p-3 font-mono text-[9px] leading-snug text-slate-700 shadow-xl ring-1 ring-slate-200 transition-all duration-700 ${phase >= 1 ? 'translate-y-0 rotate-0 opacity-100' : 'translate-y-6 -rotate-3 opacity-0'}`}>
            <p className="text-[10px] font-bold text-slate-900">CD DISPENSING REPORT</p>
            <p className="text-slate-500">Sample Pharmacy, Ennis · Dispensing system</p>
            <p className="mt-1 border-b border-slate-300 pb-1 font-semibold text-slate-900">OxyNorm 5mg capsules · 01/11/26 – 16/11/26</p>
            <div className="mt-1 grid grid-cols-[3.6rem_1fr_2rem] gap-x-1 text-[8px] font-bold uppercase text-slate-500"><span>Date</span><span>Patient / supplier</span><span className="text-right">Qty</span></div>
            {REPORT.map((r) => (
              <div key={r.n} className={`grid grid-cols-[3.6rem_1fr_2rem] gap-x-1 rounded-sm px-0.5 transition-colors duration-500 ${read && r.miss ? (added ? 'bg-brand/20' : 'bg-amber-200/80') : ''}`}>
                <span>{r.d}</span><span className="truncate">{r.n}</span><span className="text-right">{r.q}</span>
              </div>
            ))}
            <p className="mt-1 border-t border-slate-300 pt-1 text-right font-semibold">6 transactions</p>
            {phase === 1 && <span className="demo-sweep absolute inset-x-1 h-0.5 bg-brand/80 shadow-[0_0_12px_2px_rgba(84,189,80,.7)]" />}
          </div>
          <p className={`mt-2 text-center text-xs font-semibold text-muted-foreground ${fade(phase >= 1)}`}>PDF, photo or CSV export</p>
        </div>

        {/* The stock check */}
        <div className="flex min-w-0 flex-col">
          <div className="min-h-[17.5rem] rounded-xl bg-white p-3 text-[11px] text-slate-800 shadow ring-1 ring-slate-200">
            <div className="flex items-center justify-between"><p className="text-xs font-bold">Stock check · OxyNorm 5mg capsules</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">Register <b><Counter value={added ? 42 : 70} /></b> · Counted <b>42</b></span></div>
            <p className={`mt-1.5 rounded-md px-2 py-1 font-semibold transition-colors duration-500 ${added ? 'bg-brand/15 text-brand-dark' : 'bg-amber-50 text-amber-900'}`}>
              {added ? '✓ Register matches the count' : '⚠ 28 fewer in the safe than the register'}
            </p>

            {phase === 2 && <p className="mt-3 flex items-center gap-2 font-semibold"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Checking the report against the register…</p>}
            {phase < 2 && <p className={`mt-3 inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 font-semibold text-brand-dark transition-transform ${phase === 1 ? 'scale-95 ring-4 ring-brand/30' : ''}`}><ScanLine className="h-3.5 w-3.5" /> Upload report</p>}

            {read && (
              <div className="mt-2 space-y-1.5">
                <div className={`flex flex-wrap gap-1.5 text-[10px] ${fade(read)}`}>
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 font-semibold text-brand-dark">4 in the register</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">2 missing</span>
                </div>
                {REPORT.filter((r) => r.miss).map((r, i) => (
                  <div key={r.n} className={`rounded-lg p-2 ring-1 transition-all duration-500 ${added ? 'bg-brand/10 ring-brand/30' : 'bg-amber-50 ring-amber-300'} ${fade(read)}`} style={{ transitionDelay: phase === 3 ? `${300 + i * 300}ms` : '0ms' }}>
                    <div className="flex items-center gap-2">
                      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] font-bold text-white bg-brand`}>✓</span>
                      <b>{r.d}</b><span className="rounded bg-slate-100 px-1 text-[8px] font-bold uppercase text-slate-600">Supply</span><span className="font-semibold">{r.n}</span>
                      <b className="ml-auto text-red-700">{r.q}</b>
                    </div>
                    {r.miss === 'late' && <p className="mt-1 pl-5 text-[10px] font-semibold text-violet-800">⏱ Over 24 hours: late entry with footnote</p>}
                    {added && <p className="mt-0.5 pl-5 text-[10px] font-semibold text-brand-dark">✓ Added: register line {r.miss === 'late' ? 14 : 15}</p>}
                  </div>
                ))}
                {phase >= 4 && !added && (
                  <div className={`space-y-1.5 rounded-lg bg-slate-50 p-2 ${fade(phase >= 4)}`}>
                    <p className="text-[10px] text-slate-500">Footnote: <i>Late entry: not entered on the day; found at the stock check on 16/11/26 by checking the dispensing report</i></p>
                    <p className="text-[10px]">Balance 70 → after adding <b>42</b> · counted 42 <span className="font-semibold text-brand">✓ matches</span></p>
                    <span className={`flex h-8 items-center justify-center rounded-lg bg-brand-dark text-xs font-semibold text-white transition-transform duration-150 ${phase === 5 ? 'scale-95 ring-4 ring-brand/30' : ''}`}>Sign &amp; add 2 missing entries</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <h3 className="mt-6 text-2xl font-bold">Stock check that finds the missing entries</h3>
          <p className="mt-1 max-w-lg text-muted-foreground">Count doesn’t match? Upload the CD report from your dispensing system. Every line is checked against the register, anything missing is highlighted, and you tick the ones to add. One signature adds them all, with a late-entry footnote on anything over 24 hours old.</p>
          <SampleNote className="mt-2" />
        </div>
      </div>
    </div>
  );
}

export function LandingDemos() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6"><RxScanDemo /></div>
      <OstScanDemo />
      <InvoiceDemo />
      <StockReportDemo />
      <div className="grid gap-6 md:grid-cols-2">
        <BalanceDemo />
        <RepeatDemo />
        <ReminderDemo />
        <IntegrityDemo />
      </div>
    </div>
  );
}
