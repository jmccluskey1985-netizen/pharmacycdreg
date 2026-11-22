'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, ScanLine, ShieldCheck, Camera, Loader2, ImagePlus, Sparkles, BadgeCheck, Printer } from 'lucide-react';

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
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[minmax(0,15rem)_1fr] md:p-8" aria-hidden="true">
        {/* Register */}
        <div className="order-2 flex min-w-0 flex-col md:pt-10">
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
        <div className="order-1 mx-auto w-[15rem] rounded-[2.2rem] bg-slate-900 p-2 shadow-xl">
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
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white"><ImagePlus className="h-4 w-4" /></span>
                  <span className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform duration-150 ${phase === 1 ? 'scale-90' : ''}`}><span className="h-10 w-10 rounded-full bg-white" /></span>
                  <span className="h-8 w-8" />
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
          <p className="mt-1 text-muted-foreground">Uniphar, United Drug, PCO and others. Controlled drug lines are picked out, packs × pack size worked out and matched to the right register, each with a confidence level for you to check. Lines that don’t need a register entry, like Oramorph 10mg/5ml, are left out with the reason shown. Nothing is recorded until you sign.</p>
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
          <span>13/11</span><span>Colm Tuohy</span><span /><span className="text-right font-semibold">28</span>
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
export function StockReportDemo() {
  const { ref, phase } = usePhases([1800, 1700, 1200, 2600, 1700, 900, 3800, 600]);
  const REPORT = [
    { d: '05/11/2026', n: 'Grehan Maura', q: 28 },
    { d: '07/11/2026', n: 'Tuohy Colm', q: 28 },
    { d: '12/11/2026', n: 'Hehir* Paddy', q: 14, miss: 'late' },
    { d: '14/11/2026', n: 'Kinsella Bríd', q: 28 },
    { d: '15/11/2026', n: 'Corcoran Niamh', q: 14, miss: 'new' },
  ];
  const tidy = (n: string) => n.replace('*', '').split(' ').reverse().join(' ');
  const short = (d: string) => d.slice(0, 6) + d.slice(8);
  const read = phase >= 3;
  const added = phase >= 6;
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[minmax(0,24rem)_1fr] md:p-8" aria-hidden="true">
        {/* The report: a printed "Drug Search Report" from the dispensing system, photographed on the
            desk the way pharmacists do it (keyboard edge, page at a slight angle, a hand's shadow). */}
        <div className="relative mx-auto w-full max-w-[24rem]">
          <div className="relative overflow-hidden rounded-xl bg-[#d8d6d2] pt-5">
            {/* keyboard edge at the top of the photo */}
            <div className="absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-neutral-900 to-neutral-700" />
            <div className="absolute left-3 top-0.5 flex gap-1">{['B', 'N', 'M'].map((k) => <span key={k} className="flex h-3.5 w-4 items-center justify-center rounded-[2px] bg-neutral-800 text-[6px] font-bold text-neutral-300 ring-1 ring-neutral-600">{k}</span>)}</div>
            <div className={`relative mx-2 mb-3 mt-2 overflow-hidden bg-white px-2 pb-6 pt-2.5 text-[8px] leading-[1.35] sm:px-3 sm:text-[9.5px] text-black shadow-[0_6px_18px_rgba(0,0,0,.25)] transition-all duration-700 ${phase >= 1 ? 'translate-y-0 rotate-[-1.2deg] opacity-100' : 'translate-y-6 -rotate-6 opacity-0'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end">
                <p className="text-[9px] font-bold">Sample Pharmacy</p>
                <p className="text-[9.5px] font-bold tracking-wide">DRUG SEARCH REPORT</p>
                <span />
              </div>
              <div className="mt-2 grid grid-cols-[4.1rem_1fr_1.45fr_1.1rem] sm:grid-cols-[4.9rem_1fr_1.45fr_1.3rem] gap-x-1.5 bg-[#a9bff0] px-1 py-[1px]"><span className="whitespace-nowrap">Date Dispensed</span><span>Patient Name</span><span>Script Dispensed As</span><span className="text-right">Qty</span></div>
              {REPORT.map((r) => (
                <div key={r.n} className={`grid grid-cols-[4.1rem_1fr_1.45fr_1.1rem] sm:grid-cols-[4.9rem_1fr_1.45fr_1.3rem] gap-x-1.5 px-1 py-[1px] transition-colors duration-500 ${read && r.miss ? (added ? 'bg-brand/25' : 'bg-amber-200') : ''}`}>
                  <span>{r.d}</span><span className="truncate">{r.n}</span><span className="whitespace-nowrap">OXYNORM 5MG HARD CAPS</span><span className="text-right">{r.q}</span>
                </div>
              ))}
              {/* the hand and phone's shadow across the page */}
              <div className="pointer-events-none absolute -bottom-10 left-6 h-28 w-56 rotate-[-18deg] rounded-[45%] bg-neutral-900/25 blur-lg" />
              <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-40 rotate-[25deg] rounded-full bg-neutral-900/10 blur-xl" />
              {phase === 1 && <span className="demo-sweep absolute inset-x-1 h-0.5 bg-brand/80 shadow-[0_0_12px_2px_rgba(84,189,80,.7)]" />}
            </div>
            {phase === 1 && <div className="demo-flash absolute inset-0 bg-white" />}
          </div>
          <p className={`mt-1.5 text-center text-[11px] font-semibold text-muted-foreground ${fade(phase >= 1)}`}>MPS · Drug Search Report</p>
          <TouchstoreReport phase={phase} read={read} added={added} />
          <p className={`mt-1.5 text-center text-[11px] font-semibold text-muted-foreground ${fade(phase >= 1)}`}>Touchstore · Controlled Drug Report</p>
          <p className="mt-2 text-center text-xs text-muted-foreground">A photo of either printed report, or a PDF / CSV export</p>
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
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 font-semibold text-brand-dark">3 in the register</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">2 missing</span>
                </div>
                {REPORT.filter((r) => r.miss).map((r, i) => (
                  <div key={r.n} className={`rounded-lg p-2 ring-1 transition-all duration-500 ${added ? 'bg-brand/10 ring-brand/30' : 'bg-amber-50 ring-amber-300'} ${fade(read)}`} style={{ transitionDelay: phase === 3 ? `${300 + i * 300}ms` : '0ms' }}>
                    <div className="flex items-center gap-2">
                      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] font-bold text-white bg-brand`}>✓</span>
                      <b>{short(r.d)}</b><span className="rounded bg-slate-100 px-1 text-[8px] font-bold uppercase text-slate-600">Supply</span><span className="font-semibold">{tidy(r.n)}</span>
                      <b className="ml-auto text-red-700">−{r.q}</b>
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
          <p className="mt-1 max-w-lg text-muted-foreground">Count doesn’t match? Photograph the drug search report from your dispensing system (<b className="text-foreground">Touchstore</b>, <b className="text-foreground">MPS</b> or any other), or upload it as a PDF or CSV. Every line is checked against the register, anything missing is highlighted, and you tick the ones to add. One signature adds them all, with a late-entry footnote on anything over 24 hours old.</p>
          <SampleNote className="mt-2" />
        </div>
      </div>
    </div>
  );
}

/* Touchstore's "Controlled Drug Report": landscape, two lines per dispensing (who / when / script
   number, then product / quantity / prescriber), every CD on one report. Made-up people and numbers. */
function TouchstoreReport({ phase, read, added }: { phase: number; read: boolean; added: boolean }) {
  const ROWS = [
    { when: '12/11/2026 09:41 12/11/2026', name: 'HEHIR, Paddy', id: '30418', addr: '3 Mill Lane, Ennis', sch: 'GM', no: 'GM2611/0041', prod: 'OXYNORM 5MG HARD CAPS', pack: '56CAPS', dose: '61204  ONE FOUR TIMES DAILY AS REQUIRED', q: '14', price: '9.80', dr: 'Brennan, Dr Aoife', miss: true },
    { when: '13/11/2026 10:02 13/11/2026', name: 'FARRELL, Declan', id: '30122', addr: '12 Abbey Court, Ennis', sch: 'ME', no: 'ME2611/0044', prod: 'METHADONE HCL SF 1MG/ML ORAL SOLN', pack: '500ML', dose: '58830  take 60ml once a day', q: '420', price: '14.20', dr: 'Nolan, Dr Ciarán', note: 'Phased : Request of physician 13/11/2026 10:02' },
    { when: '14/11/2026 15:20 14/11/2026', name: 'LYNCH, Gerard', id: '30877', addr: '8 Weir Road, Clarecastle', sch: 'DP', no: 'DP2611/0102', prod: 'MST CONTINUS 10MG PRO REL TABS', pack: '60TABS', dose: '60411  ONE TO BE TAKEN TWICE DAILY', q: '56', price: '15.85', dr: 'Brennan, Dr Aoife' },
    { when: '15/11/2026 11:12 15/11/2026', name: 'CORCORAN, Niamh', id: '31056', addr: '27 Station Road, Ennis', sch: 'EM', no: 'EM2611/0118', prod: 'OXYNORM 5MG HARD CAPS', pack: '56CAPS', dose: '62290  ONE EVERY 4-6 HOURS IF REQUIRED', q: '14', price: '9.80', dr: 'Ennis General Hosp.', miss: true },
  ];
  const cols = 'grid grid-cols-[5.3rem_4.1rem_1.7rem_minmax(0,1fr)_1.1rem_1.1rem_1.5rem_3.6rem] gap-x-1';
  return (
    <div className="relative mt-3 overflow-hidden rounded-xl bg-[#d8d6d2] p-2" aria-hidden="true">
      <div className={`relative overflow-hidden bg-white px-2 pb-2 pt-1.5 text-[5.6px] leading-[1.3] text-black shadow-[0_6px_18px_rgba(0,0,0,.25)] transition-all duration-700 sm:text-[6.2px] ${phase >= 1 ? 'translate-y-0 rotate-[0.8deg] opacity-100' : 'translate-y-6 rotate-3 opacity-0'}`} style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end">
          <span className="text-[7px] font-bold">Schemes</span>
          <p className="text-[9.5px] font-bold">Controlled Drug Report</p>
          <p className="text-right text-[7px]">Sample Pharmacy (1)</p>
        </div>
        <div className="mt-1 border-y border-black py-0.5 font-bold">
          <div className={cols}><span className="leading-tight">Disp&apos;d / Prescription Date/Time</span><span>Patient Name</span><span>Patient ID</span><span>Address</span><span className="col-span-1">Scheme</span><span className="col-span-2 text-center">No.</span><span className="text-right">Dispenser</span></div>
          <div className={cols}><span className="col-span-2">Product Name</span><span>Pack Size</span><span>GMS No. &nbsp;Dosage</span><span>Qty. Disp</span><span>Qty. Ow&apos;d</span><span>Price</span><span className="text-right">Prescriber Name</span></div>
        </div>
        {ROWS.map((r) => (
          <div key={r.no} className={`border-b border-neutral-400 py-[2px] transition-colors duration-500 ${read && r.miss ? (added ? 'bg-brand/25' : 'bg-amber-200') : ''}`}>
            <div className={cols}><span className="whitespace-nowrap">{r.when}</span><span className="truncate">{r.name}</span><span>{r.id}</span><span className="truncate">{r.addr}</span><span>{r.sch}</span><span className="col-span-2 text-center">{r.no}</span><span className="text-right">Aoife</span></div>
            <div className={cols}><span className="col-span-2 truncate">{r.prod}</span><span>{r.pack}</span><span className="truncate">{r.dose}</span><span className="text-right">{r.q}</span><span className="text-right">0</span><span className="text-right">{r.price}</span><span className="truncate text-right">{r.dr}</span></div>
            {r.note && <p className="pl-[5.3rem]">{r.note}</p>}
          </div>
        ))}
        <div className="pointer-events-none absolute -right-6 bottom-[-2.5rem] h-20 w-44 rotate-[14deg] rounded-[45%] bg-neutral-900/20 blur-lg" />
      </div>
    </div>
  );
}

function FileChip({ name, sub, on, tone }: { name: string; sub: string; on: boolean; tone: string }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl bg-white p-2.5 shadow ring-1 ring-slate-200 transition-all duration-700 ${on ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'}`}>
      <span className={`flex h-10 w-8 flex-col items-center justify-end rounded-sm pb-1 text-[8px] font-extrabold text-white shadow-inner ${tone}`}>{name.split('.').pop()!.toUpperCase()}</span>
      <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{name}</span><span className="block text-[10px] text-slate-500">{sub}</span></span>
    </div>
  );
}

/* Saved report files read exactly, no AI: a Touchstore .QRP and an MPS .csv drop in, their lines
   come out exactly as printed, and each is checked against its book. Made-up people and numbers. */
export function FileImportDemo() {
  const { ref, phase } = usePhases([1200, 1100, 2400, 1100, 2400, 3800]);
  const QRP = [
    { d: '12/11/2026', n: 'Paddy Hehir', p: 'OXYNORM 5MG HARD CAPS', q: 14, s: 'missing' },
    { d: '13/11/2026', n: 'Declan Farrell', p: 'METHADONE HCL SF 1MG/ML ORAL SOLN', q: 420, s: 'ok' },
    { d: '14/11/2026', n: 'Gerard Lynch', p: 'MST CONTINUS 10MG PRO REL TABS', q: 56, s: 'ok' },
  ];
  const CSV = [
    { d: '15/11/2026', n: 'Niamh Corcoran', p: 'OXYNORM 5MG HARD CAPS', q: 14, s: 'missing' },
    { d: '16/11/2026', n: 'Maura Grehan', p: 'OXYNORM 5MG HARD CAPS', q: 28, s: 'ok' },
  ];
  const qrpIn = phase >= 1, qrpRead = phase >= 2, csvIn = phase >= 3, csvRead = phase >= 4, done = phase >= 5;
  const rows = [...(qrpRead ? QRP.map((r) => ({ ...r, f: 'QRP' })) : []), ...(csvRead ? CSV.map((r) => ({ ...r, f: 'CSV' })) : [])];
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[minmax(0,17rem)_1fr] md:p-8">
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className={`rounded-xl border-2 border-dashed p-3 text-center text-[11px] font-semibold transition-colors duration-500 ${phase === 1 || phase === 3 ? 'border-brand bg-brand/10 text-brand-dark' : 'border-slate-300 text-slate-500'}`}>Drop the saved report here</div>
          <FileChip name="Controlled Drug Report.QRP" sub="Touchstore · saved report" on={qrpIn} tone="bg-sky-700" />
          <FileChip name="DrugSearch.csv" sub="MPS · saved as CSV" on={csvIn} tone="bg-emerald-700" />
          <p className={`text-center text-[11px] font-semibold text-sky-900 ${fade(qrpRead)}`}>Read exactly from the file: no AI, nothing guessed</p>
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="min-h-[15rem] overflow-x-auto rounded-xl bg-white p-3 text-[11px] text-slate-800 shadow ring-1 ring-slate-200" aria-hidden="true">
            <div className="flex items-center justify-between"><p className="text-xs font-bold">Check report · every book</p>{phase === 2 || phase === 4 ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : null}</div>
            <table className="mt-2 w-full border-collapse">
              <thead><tr className="border-b border-slate-200 text-left text-[9px] uppercase tracking-wide text-slate-500"><th className="py-1">File</th><th>Date</th><th>Patient</th><th className="hidden sm:table-cell">Product</th><th className="text-right">Qty</th><th className="pl-2 text-right">Register</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.f + r.d + r.n} className={`border-b border-slate-100 transition-all duration-500 ${done && r.s === 'missing' ? 'bg-amber-50' : ''}`} style={{ animation: 'fadeInUp .45s ease both', animationDelay: `${(r.f === 'CSV' ? i - QRP.length : i) * 120}ms` }}>
                    <td className="py-1"><span className={`rounded px-1 text-[8px] font-bold text-white ${r.f === 'QRP' ? 'bg-sky-700' : 'bg-emerald-700'}`}>{r.f}</span></td>
                    <td className="tabular-nums">{r.d.slice(0, 5)}</td><td className="whitespace-nowrap">{r.n}</td><td className="hidden max-w-[9rem] truncate text-[10px] sm:table-cell">{r.p}</td><td className="text-right font-semibold tabular-nums">{r.q}</td>
                    <td className={`pl-2 text-right text-[10px] font-semibold ${fade(done)} ${r.s === 'missing' ? 'text-amber-800' : 'text-brand-dark'}`}>{r.s === 'missing' ? 'Missing' : '✓ In book'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {done && (
              <div className={`mt-2 flex flex-wrap gap-1.5 text-[10px] ${fade(done)}`}>
                <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">3 books on the report</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">2 missing in OxyNorm 5mg capsules</span>
                <span className="rounded-full bg-brand/15 px-2 py-0.5 font-semibold text-brand-dark">Methadone and MST match</span>
              </div>
            )}
          </div>
          <h3 className="mt-6 text-2xl font-bold">Or upload the saved report file</h3>
          <p className="mt-1 max-w-lg text-muted-foreground">Touchstore’s <b className="text-foreground">.QRP</b> report and MPS’s <b className="text-foreground">CSV</b> export are read exactly from the file, without the AI reader. One report is checked against every book at once, with each missing line ready to tick and sign. Excel, PDF and other formats work too.</p>
          <SampleNote className="mt-2" />
        </div>
      </div>
    </div>
  );
}

/* The printable CD balances list (Registers → Balances list). Made-up pharmacy and figures. */
export function BalancesListPreview() {
  const ROWS: [string, string, string, string, boolean?][] = [
    ['Schedule 2', '', '', ''],
    ['Concerta XL (Methylphenidate) 18mg prolonged-release tablet', '60', 'tablets', '14/11/2026 (6 days ago)'],
    ['Durogesic (Fentanyl) 25mcg/hr transdermal patch', '10', 'patches', '14/11/2026 (6 days ago)'],
    ['Methadone Rowex 1mg/ml oral solution', '4,580', 'ml', '18/11/2026 (2 days ago)'],
    ['MST Continus (Morphine) 10mg prolonged-release tablet', '64', 'tablets', '23/10/2026 (28 days ago) · due', true],
    ['OxyNorm (Oxycodone) 5mg capsule', '42', 'capsules', '20/11/2026 (today)'],
    ['Targin (Oxycodone / Naloxone) 10mg/5mg prolonged-release tablet', '28', 'tablets', 'Never · due', true],
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[1fr_minmax(0,18rem)] md:p-8">
        <div className="min-w-0 overflow-x-auto" aria-hidden="true">
          <div className="min-w-[30rem] rotate-[0.3deg] rounded-sm bg-white p-4 text-black shadow-[0_8px_24px_rgba(0,0,0,.15)] ring-1 ring-slate-200">
            <div className="flex items-start justify-between border-b-[3px] border-[#184B21] pb-1.5">
              <div><p className="text-lg font-extrabold leading-tight text-[#184B21]">CD Balances</p><p className="text-[10px] text-slate-600">Sample Pharmacy · 1 Main Street, Ennis</p></div>
              <div className="text-right"><p className="text-[11px] font-bold">Date: 20/11/2026</p><p className="text-[9px] text-slate-600">Balances at 09:15 · 6 books · 2 stock checks due</p></div>
            </div>
            <table className="mt-2 w-full border-collapse text-[10px]">
              <thead><tr className="bg-[#B7B7B7] [&>th]:border [&>th]:border-slate-400 [&>th]:px-1.5 [&>th]:py-1"><th className="text-left">CD Medicine</th><th className="w-[4.5rem]">Balance</th><th className="w-[9.5rem]">Last stock check</th></tr></thead>
              <tbody>
                {ROWS.map(([name, bal, unit, last, due], i) => bal === '' ? (
                  <tr key={i}><td colSpan={3} className="border border-slate-400 bg-[#E6F4E5] px-1.5 py-0.5 font-bold text-[#184B21]">{name}</td></tr>
                ) : (
                  <tr key={i} className="[&>td]:border [&>td]:border-slate-400 [&>td]:px-1.5 [&>td]:py-1">
                    <td>{name}</td>
                    <td className="text-center font-bold tabular-nums">{bal} <span className="text-[8px] font-normal text-slate-600">{unit}</span></td>
                    <td className={`text-center text-[9px] ${due ? 'font-semibold text-amber-700' : ''}`}>{last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <h3 className="text-2xl font-bold">Every balance on one page</h3>
          <p className="mt-1 text-muted-foreground">Print a dated list of every CD with its balance and when its stock was last checked, with overdue checks flagged. Save it as a PDF or download it for Excel. Add count columns when you want a sheet to count against.</p>
          <SampleNote className="mt-2" />
        </div>
      </div>
    </div>
  );
}

/* The risk assessment PSI guidance expects before going electronic: details fill in from the
   pharmacy's account, each risk is rated, the checklist ticks itself, then it's signed with one
   click. Made-up pharmacy and pharmacist. */
export function RiskAssessmentDemo() {
  const { ref, phase } = usePhases([1300, 1800, 2600, 1800, 1400, 3800]);
  const DETAILS: [string, string][] = [['Pharmacy', 'Sample Pharmacy, Ennis'], ['PSI no.', '1234'], ['Assessed by', 'Aoife Byrne, Supervising pharmacist'], ['Review date', '21/11/2027']];
  const RISKS: [string, 'Low' | 'Medium'][] = [['Access and security', 'Low'], ['Integrity of the record', 'Low'], ['System or internet outage', 'Low'], ['Data loss and recovery', 'Low'], ['Data protection (GDPR)', 'Low'], ['Staff training', 'Medium']];
  const CHECKS = ['Every staff member has their own PIN', 'Each book opened with balance brought forward', 'Two-step sign-in turned on'];
  const signed = phase >= 5;
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[1fr_minmax(0,18rem)] md:p-8">
        <div className="min-w-0 rounded-xl bg-white p-4 text-[11px] text-slate-800 shadow ring-1 ring-slate-200" aria-hidden="true">
          <div className="flex items-center justify-between gap-2 border-b-2 border-[#184B21] pb-1.5">
            <p className="text-sm font-extrabold text-[#184B21]">Risk assessment: electronic CD register</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors duration-500 ${signed ? 'bg-brand/15 text-brand-dark' : 'bg-amber-100 text-amber-900'}`}>{signed ? '✓ Signed' : 'Not signed yet'}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {DETAILS.map(([k, v], i) => (
              <div key={k}><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{k}</p>
                <p className="h-4 overflow-hidden whitespace-nowrap border-b border-slate-200 font-medium"><span className="inline-block transition-all duration-500" style={{ clipPath: phase >= 1 ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)', transitionDelay: phase >= 1 ? `${i * 250}ms` : '0ms', transitionDuration: '600ms' }}>{v}</span></p>
              </div>
            ))}
          </div>
          {phase >= 1 && <p className={`mt-1 text-[9px] font-semibold text-brand-dark ${fade(phase >= 1)}`}>Filled in from your account</p>}
          <div className="mt-3 space-y-1">
            {RISKS.map(([name, level], i) => (
              <div key={name} className={`flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1 transition-all duration-500 ${phase >= 2 ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'}`} style={{ transitionDelay: phase === 2 ? `${i * 250}ms` : '0ms' }}>
                <span className="w-4 text-[9px] font-bold text-slate-400">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{name}</span>
                <span className="hidden text-[9px] text-slate-500 sm:inline">controls in place</span>
                <span className={`w-14 rounded px-1.5 py-0.5 text-center text-[9px] font-bold ${level === 'Low' ? 'bg-brand/15 text-brand-dark' : 'bg-amber-100 text-amber-900'}`}>{level}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-1 sm:grid-cols-3">
            {CHECKS.map((c, i) => (
              <p key={c} className="flex items-start gap-1.5 text-[10px]">
                <span className={`mt-px flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm border text-[9px] font-bold text-white transition-all duration-300 ${phase >= 3 ? 'border-brand bg-brand' : 'border-slate-300 bg-white'}`} style={{ transitionDelay: phase === 3 ? `${i * 300}ms` : '0ms' }}>{phase >= 3 ? '✓' : ''}</span>{c}
              </p>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
            {!signed ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold text-white transition-colors ${phase >= 4 ? 'border-brand bg-brand' : 'border-slate-300 bg-white'}`}>{phase >= 4 ? '✓' : ''}</span>
                <span className="flex-1 text-[10px]">I’ve reviewed this risk assessment</span>
                <span className={`relative rounded-md bg-brand-dark px-3 py-1.5 text-[10px] font-semibold text-white transition-transform duration-150 ${phase === 4 ? 'scale-95 ring-4 ring-brand/30' : ''} ${phase >= 4 ? 'opacity-100' : 'opacity-50'}`}>Sign as Aoife Byrne (PSI 12345)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2" style={{ animation: 'fadeInUp .45s ease both' }}>
                <BadgeCheck className="h-5 w-5 flex-shrink-0 text-brand" />
                <div><p className="text-[11px] font-bold">Signed electronically by Aoife Byrne (PSI 12345), Supervising pharmacist</p><p className="text-[9px] text-slate-500">21 November 2026 at 09:15 · this signed version can’t be changed</p></div>
                <span className="ml-auto hidden items-center gap-1 rounded-md bg-white px-2 py-1 text-[9px] font-semibold ring-1 ring-slate-200 sm:inline-flex"><Printer className="h-3 w-3" /> Print</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <h3 className="text-2xl font-bold">Your risk assessment, ready to sign</h3>
          <p className="mt-1 text-muted-foreground">PSI guidance expects a risk assessment before you move to electronic records. Yours is filled in from your pharmacy’s details, with every risk and suggested answer already there. Change anything that’s different, sign with one click, and print it whenever you need it.</p>
          <a href="/risk-assessment" className="mt-3 text-sm font-semibold text-brand-dark underline">See the free template →</a>
          <SampleNote className="mt-2" />
        </div>
      </div>
    </div>
  );
}

/* Stock count: type what's on the shelf, differences show green (0) or red, tick each row complete,
   and it's written into that drug's register as a "balance confirmed" line. Made-up pharmacy and figures. */
export function StockCountDemo() {
  const { ref, phase } = usePhases([1200, 2600, 1600, 2200, 2600, 4200]);
  const ROWS: { name: string; unit: string; bal: number; count: number; note?: string }[] = [
    { name: 'OxyNorm 5mg capsule', unit: 'capsules', bal: 42, count: 42 },
    { name: 'Methadone Rowex 1mg/ml', unit: 'ml', bal: 4580, count: 4580 },
    { name: 'MST Continus 10mg tablet', unit: 'tablets', bal: 64, count: 62, note: 'Two found in returns bag, being checked' },
    { name: 'Durogesic 25mcg/hr patch', unit: 'patches', bal: 10, count: 10 },
  ];
  const typed = phase >= 1, diffs = phase >= 2, noted = phase >= 3, logged = phase >= 3, book = phase >= 4;
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      <div className="grid gap-6 bg-gradient-to-b from-secondary/70 to-background p-5 md:grid-cols-[1fr_minmax(0,18rem)] md:p-8">
        <div className="min-w-0 space-y-3" aria-hidden="true">
          <div className="overflow-x-auto rounded-xl bg-white p-3 text-[11px] text-slate-800 shadow ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold">Stock count</p>
              <p className="text-[10px] font-semibold text-slate-500">Start date: 21/11/2026 09:00</p>
            </div>
            <table className="mt-2 w-full min-w-[26rem] border-collapse">
              <thead><tr className="border-b border-slate-200 text-left text-[9px] uppercase tracking-wide text-slate-500"><th className="py-1">Medicine</th><th className="text-right">Register</th><th className="text-right">Counted</th><th className="text-center">Difference</th><th className="text-center">Complete</th></tr></thead>
              <tbody>
                {ROWS.map((r, i) => {
                  const d = r.count - r.bal;
                  return (
                    <tr key={r.name} className="border-b border-slate-100">
                      <td className="py-1.5 font-medium">{r.name}
                        {r.note && noted && <span className="ml-1 rounded bg-amber-100 px-1 text-[8px] font-semibold text-amber-900" style={{ animation: 'fadeInUp .4s ease both' }}>note</span>}
                      </td>
                      <td className="text-right tabular-nums text-slate-500">{r.bal.toLocaleString('en-IE')}</td>
                      <td className="text-right">
                        <span className={`inline-block min-w-[3.2rem] rounded border px-1 py-0.5 text-right font-semibold tabular-nums transition-colors duration-300 ${typed ? 'border-brand/50' : 'border-slate-200 text-transparent'}`} style={{ transitionDelay: typed ? `${i * 450}ms` : '0ms' }}>
                          {typed ? r.count.toLocaleString('en-IE') : '0'}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={`inline-block min-w-[2.2rem] rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-all duration-500 ${diffs ? (d === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700') : 'opacity-0'}`} style={{ transitionDelay: diffs ? `${i * 200}ms` : '0ms' }}>{d > 0 ? `+${d}` : d}</span>
                      </td>
                      <td className="text-center">
                        <span className={`inline-flex h-4 items-center justify-center rounded px-1 text-[9px] font-bold transition-all duration-300 ${logged ? 'bg-brand text-white' : 'border border-slate-300 bg-white text-transparent'}`} style={{ transitionDelay: logged ? `${i * 250}ms` : '0ms' }}>{logged ? '✓ Logged' : '·'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {noted && <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-900" style={{ animation: 'fadeInUp .4s ease both' }}>MST Continus note: Two found in returns bag, being checked</p>}
          </div>
          <div className={`overflow-x-auto rounded-sm bg-[#fffdf6] p-3 text-[10px] text-slate-800 shadow ring-1 ring-slate-200 transition-all duration-700 ${book ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>
            <p className="text-[10px] font-bold uppercase">Product: <span className="text-xs normal-case underline decoration-dotted underline-offset-2">OxyNorm (Oxycodone) 5mg capsule</span></p>
            <table className="mt-1.5 w-full min-w-[26rem] border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-slate-300 [&_th]:px-1.5 [&_th]:py-0.5">
              <thead><tr className="text-[8px] uppercase text-slate-500"><th className="text-left">Date</th><th className="text-left">Name and address</th><th>Obtained</th><th>Supplied</th><th>Balance</th><th className="text-left">Pharmacist</th></tr></thead>
              <tbody>
                <tr><td className="tabular-nums">19/11/26</td><td>Niamh Corcoran<span className="block text-[8px] opacity-70">Station Rd, Ennis</span></td><td /><td className="text-right font-semibold">14</td><td className="text-right font-bold">42</td><td>A. Byrne</td></tr>
                {book && (
                  <tr className="bg-emerald-50" style={{ animation: 'fadeInUp .5s ease both', animationDelay: '300ms' }}>
                    <td className="tabular-nums">21/11/26</td>
                    <td><span className="font-semibold">STOCK CHECK</span><span className="block text-[9px] font-semibold text-emerald-700">✓ Balance confirmed correct: 42 capsules counted</span></td>
                    <td /><td />
                    <td className="text-right font-bold">42<span className="text-emerald-600">✓</span></td>
                    <td>A. Byrne</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-col justify-center">
          <h3 className="text-2xl font-bold">Count stock on screen, logged in every book</h3>
          <p className="mt-1 text-muted-foreground">Type what’s on the shelf and the difference works itself out: <b className="text-green-700">0 in green</b>, anything else <b className="text-red-700">in red</b> with a note on what you found. Tick each row complete and it’s written into that drug’s register as a dated line, showing the balance was confirmed correct and who checked it. Counts can run over several days, and print or download for Excel.</p>
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
      <FileImportDemo />
      <BalancesListPreview />
      <StockCountDemo />
      <RiskAssessmentDemo />
      <div className="grid gap-6 md:grid-cols-2">
        <BalanceDemo />
        <RepeatDemo />
        <ReminderDemo />
        <IntegrityDemo />
      </div>
    </div>
  );
}
