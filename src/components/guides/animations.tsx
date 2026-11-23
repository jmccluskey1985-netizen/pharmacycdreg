'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Camera, BookOpen, ShieldCheck, ShieldAlert, FileSearch, Loader2 } from 'lucide-react';
import { usePhases, SampleNote } from '@/components/landing-demos';

/* Animated illustrations for the public guides. Every name and number is made up. */

const fade = (on: boolean) => `transition-all duration-500 ease-out ${on ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`;

function Frame({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <figure className="not-prose my-2 overflow-hidden rounded-3xl bg-gradient-to-br from-secondary via-background to-secondary/60 p-4 shadow-soft ring-1 ring-border sm:p-6">
      <div aria-hidden="true">{children}</div>
      {caption && <figcaption className="mt-3 text-center text-sm text-muted-foreground">{caption}</figcaption>}
      <SampleNote className="mt-1 text-center" />
    </figure>
  );
}

/** Steps that tick off as you scroll down, joined by a line that fills in. */
export function StepTimeline({ steps }: { steps: { title: string; text: React.ReactNode; icon?: React.ReactNode }[] }) {
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const [reached, setReached] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- no observer (old browser): show every step
    if (typeof IntersectionObserver === 'undefined') { setReached(steps.length); return; }
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { const i = Number((e.target as HTMLElement).dataset.i); setReached((r) => Math.max(r, i + 1)); }
    }, { rootMargin: '0px 0px -35% 0px', threshold: 0.2 });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);
  return (
    <ol className="relative my-4 space-y-5 pl-14">
      <span className="absolute bottom-6 left-[1.35rem] top-6 w-1 rounded-full bg-border" />
      <span className="absolute left-[1.35rem] top-6 w-1 rounded-full bg-brand transition-all duration-700 ease-out" style={{ height: `calc(${Math.min(1, Math.max(0, (reached - 1) / Math.max(1, steps.length - 1))) * 100}% - 3rem)` }} />
      {steps.map((s, i) => {
        const on = reached > i;
        return (
          <li key={i} id={`step-${i + 1}`} data-i={i} ref={(el) => { refs.current[i] = el; }} className="relative scroll-mt-24">
            <span className={`absolute -left-14 top-1 flex h-11 w-11 items-center justify-center rounded-full text-base font-extrabold shadow-soft ring-4 ring-background transition-all duration-500 ${on ? 'scale-100 bg-brand text-white' : 'scale-90 bg-card text-muted-foreground ring-border'}`}>
              {on ? <Check className="h-5 w-5" strokeWidth={3} /> : i + 1}
            </span>
            <div className={`rounded-2xl bg-card p-5 shadow-soft ring-1 transition-all duration-700 ${on ? 'translate-x-0 opacity-100 ring-brand/25' : 'translate-x-3 opacity-60 ring-border'}`}>
              <p className="flex items-center gap-2 text-lg font-bold">{s.icon}<span><span className="text-brand">Step {i + 1}.</span> {s.title}</span></p>
              <div className="mt-1 text-[16px] leading-relaxed text-muted-foreground">{s.text}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One register line, each part lit up in turn with what it records. */
export function RegisterLineAnatomy() {
  const PARTS = [
    { k: 'date', label: 'Date of the supply', text: 'The day it happened. Entered on the day, or the next day at the latest.' },
    { k: 'who', label: 'Supplied to: name and address', text: 'The patient (or the representative collecting), with their address.' },
    { k: 'auth', label: 'Authority: the prescriber', text: 'Who wrote the prescription, with their address and the prescription reference.' },
    { k: 'qty', label: 'Amount supplied', text: 'In the book’s unit: tablets, capsules, ml or patches.' },
    { k: 'bal', label: 'Running balance', text: 'Worked out for you after every line, never typed in.' },
    { k: 'sig', label: 'Pharmacist', text: 'Signed with their own PIN: name and PSI number on the line.' },
  ];
  const { ref, phase } = usePhases(PARTS.map(() => 2300));
  const cur = PARTS[phase];
  const hi = (k: string) => `rounded-md px-1.5 py-1 transition-all duration-300 ${cur.k === k ? 'bg-amber-200 ring-2 ring-amber-400 text-amber-950' : ''}`;
  return (
    <div ref={ref}>
      <Frame caption="What one supply line records">
        <div className="overflow-x-auto rounded-xl bg-white shadow ring-1 ring-slate-200">
          <div className="min-w-[38rem] text-[12.5px] text-slate-800">
            <div className="flex items-center justify-between border-b-2 border-[#184B21] px-4 py-2"><span className="font-bold text-[#184B21]">OxyNorm 5mg capsules</span><span className="text-[11px] text-slate-500">Schedule 2 · capsules</span></div>
            <div className="grid grid-cols-[5.5rem_1.5fr_1.4fr_4rem_4.5rem_6.5rem] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span>Date</span><span>Supplied to</span><span>Prescriber</span><span className="text-right">Out</span><span className="text-right">Balance</span><span>Pharmacist</span></div>
            <div className="grid grid-cols-[5.5rem_1.5fr_1.4fr_4rem_4.5rem_6.5rem] items-center gap-2 px-4 py-2.5 text-slate-400"><span>18/11/26</span><span>Maura Grehan, 4 Fern Rd, Ennis</span><span>Dr A. Brennan · Rx 10402</span><span className="text-right">28</span><span className="text-right">70</span><span>C. Walsh 23456</span></div>
            <div className="grid grid-cols-[5.5rem_1.5fr_1.4fr_4rem_4.5rem_6.5rem] items-center gap-2 px-4 py-2.5 font-medium">
              <span className={hi('date')}>20/11/26</span>
              <span className={hi('who')}>Eamon Tobin, 27 Station Rd, Ennis</span>
              <span className={hi('auth')}>Dr A. Brennan · Rx 10417</span>
              <span className={`text-right ${hi('qty')}`}>14</span>
              <span className={`text-right font-bold ${hi('bal')}`}>56</span>
              <span className={hi('sig')}>A. Byrne 12345</span>
            </div>
          </div>
        </div>
        <div key={cur.k} className="mx-auto mt-4 max-w-md rounded-2xl bg-card p-4 text-center shadow-soft ring-1 ring-amber-300" style={{ animation: 'fadeInUp .4s ease both' }}>
          <p className="text-sm font-bold text-amber-900">{cur.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{cur.text}</p>
        </div>
        <div className="mt-3 flex justify-center gap-1.5">{PARTS.map((p, i) => <span key={p.k} className={`h-1.5 rounded-full transition-all ${i === phase ? 'w-6 bg-amber-500' : 'w-1.5 bg-slate-300'}`} />)}</div>
      </Frame>
    </div>
  );
}

/** Lines sealed to each other: change one quietly and the chain breaks from there on. */
export function TamperChain() {
  const { ref, phase } = usePhases([1600, 1600, 1600, 1800, 2600, 2400]);
  const LINES = ['+56 received · balance 98', '−14 Eamon Tobin · balance 84', '−28 Maura Grehan · balance 56', '−14 Bríd Kinsella · balance 42'];
  const sealed = Math.min(phase + 1, 4);
  const tampered = phase === 4;
  const verified = phase === 5;
  return (
    <div ref={ref}>
      <Frame caption="Each line’s fingerprint includes the line before it">
        <div className="mx-auto flex max-w-xl flex-col items-center">
          {LINES.map((l, i) => {
            const broken = tampered && i >= 1;
            const on = i < sealed || verified;
            return (
              <div key={i} className="flex w-full flex-col items-center">
                {i > 0 && <span className={`h-5 w-1 rounded-full transition-colors duration-500 ${broken ? 'bg-red-400' : on ? 'bg-brand' : 'bg-slate-200'}`} />}
                <div className={`flex w-full items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-sm shadow ring-1 transition-all duration-500 ${broken ? 'ring-red-300' : on ? 'ring-brand/30' : 'opacity-50 ring-slate-200'}`}>
                  <span className="w-6 text-xs font-bold text-slate-400">{i + 1}</span>
                  <span className={`flex-1 font-medium ${tampered && i === 1 ? 'text-red-700' : 'text-slate-800'}`}>{tampered && i === 1 ? '−4 Eamon Tobin · balance 94' : l}</span>
                  <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${broken ? 'bg-red-100 text-red-800' : on ? 'bg-brand/15 text-brand-dark' : 'bg-slate-100 text-slate-400'}`}>{on ? (broken ? '✗ mismatch' : ['a3f9…', '7c21…', 'e04b…', '91d6…'][i]) : '……'}</span>
                </div>
              </div>
            );
          })}
          <div className={`mt-4 flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-all duration-500 ${tampered ? 'bg-red-100 text-red-800' : verified ? 'bg-brand/15 text-brand-dark' : 'bg-transparent text-transparent'}`}>
            {tampered ? <><ShieldAlert className="h-4 w-4" /> Changed after signing: verify shows line 2</> : <><ShieldCheck className="h-4 w-4" /> Verify integrity: every line intact</>}
          </div>
        </div>
      </Frame>
    </div>
  );
}

/** Count the stock, compare with the register, check the report, find what's missing, match. */
export function CountCompare() {
  const { ref, phase } = usePhases([1500, 2200, 2000, 1800, 2400, 3200]);
  const counted = phase >= 1 ? 42 : 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown === counted) return;
    const t = setTimeout(() => setShown((s) => (counted > s ? Math.min(counted, s + 3) : counted)), 40);
    return () => clearTimeout(t);
  }, [shown, counted]);
  const register = phase >= 5 ? 42 : 70;
  return (
    <div ref={ref}>
      <Frame caption="Count, compare, and let the report explain any difference">
        <div className="grid items-center gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 text-center shadow ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Counted in the safe</p>
            <div className="mx-auto mt-2 grid w-fit grid-cols-7 gap-1">{Array.from({ length: 14 }).map((_, i) => <span key={i} className={`h-3 w-5 rounded-full bg-gradient-to-r from-rose-300 to-sky-300 shadow-inner transition-all duration-300 ${phase >= 1 ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: `${i * 70}ms` }} />)}</div>
            <p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-800">{shown}</p>
            <p className="text-xs text-slate-500">capsules</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <span className={`rounded-full px-3 py-1 text-sm font-bold transition-all duration-500 ${phase >= 5 ? 'bg-brand/15 text-brand-dark' : phase >= 2 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-400'}`}>{phase >= 5 ? '✓ Matches' : phase >= 2 ? '28 fewer than the register' : 'Compare'}</span>
            <div className={`mt-3 w-full rounded-xl bg-white p-3 text-left text-xs shadow ring-1 ring-slate-200 ${fade(phase >= 3)}`}>
              <p className="flex items-center gap-1.5 font-semibold text-slate-700">{phase === 3 ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" /> : <FileSearch className="h-3.5 w-3.5 text-brand" />} Dispensing report checked</p>
              {phase >= 4 && <ul className="mt-1.5 space-y-1">{[['12/11', 'Paddy Hehir'], ['15/11', 'Niamh Corcoran']].map(([d, n]) => <li key={n} className={`flex justify-between rounded-md px-2 py-1 ${phase >= 5 ? 'bg-brand/10 text-brand-dark' : 'bg-amber-50 text-amber-900'}`}><span>{d} {n}</span><b>−14</b></li>)}</ul>}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 text-center shadow ring-1 ring-slate-200">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Register balance</p>
            <BookOpen className="mx-auto mt-2 h-10 w-10 text-brand-dark" />
            <p className={`mt-2 text-3xl font-extrabold tabular-nums transition-colors duration-500 ${phase >= 5 ? 'text-brand-dark' : 'text-slate-800'}`}>{register}</p>
            <p className="text-xs text-slate-500">{phase >= 5 ? 'after adding 2 missing lines' : 'OxyNorm 5mg capsules'}</p>
          </div>
        </div>
      </Frame>
    </div>
  );
}

/** Paper register's last page photographed; its balance carried forward into a new electronic book. */
export function PaperToDigital() {
  const { ref, phase } = usePhases([1600, 1200, 1900, 1900, 3200]);
  const PAPER = [['14/11', 'Rec’d Unopharma', '+56', '182'], ['15/11', 'P. Hehir', '−14', '168'], ['17/11', 'N. Corcoran', '−28', '140']];
  return (
    <div ref={ref}>
      <Frame caption="The last paper balance becomes the first electronic line">
        <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
          <div className="relative mx-auto w-full max-w-[17rem]">
            <div className={`relative rotate-[-2deg] rounded-sm bg-[#fdfaf1] p-3 shadow-lg ring-1 ring-amber-900/10 transition-all duration-500 ${phase === 1 ? 'scale-[1.02]' : ''}`} style={{ backgroundImage: 'repeating-linear-gradient(transparent 0 21px, rgba(30,64,175,.12) 21px 22px)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">OxyNorm 5mg caps · Sch 2</p>
              {PAPER.map((r, i) => (
                <div key={i} className="grid grid-cols-[2.4rem_1fr_2rem_2rem] gap-1 text-[12px] leading-[22px] text-[#1e3a8a]" style={{ fontFamily: '"Comic Sans MS", "Segoe Print", cursive' }}>
                  <span>{r[0]}</span><span className="truncate">{r[1]}</span><span>{r[2]}</span><span className={i === 2 && phase >= 2 ? 'rounded bg-amber-200 font-bold' : ''}>{r[3]}</span>
                </div>
              ))}
              {phase >= 4 && <p className="mt-1 -rotate-1 text-[11px] font-bold text-[#1e3a8a]" style={{ fontFamily: '"Comic Sans MS", "Segoe Print", cursive', animation: 'fadeInUp .5s ease both' }}>Continued in electronic register 20/11/26 · A.B.</p>}
            </div>
            {phase === 1 && <div className="demo-flash absolute inset-0 rounded-sm bg-white" />}
            <span className={`absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-dark text-white shadow-lg transition-all duration-300 ${phase === 1 ? 'scale-110' : 'scale-90 opacity-70'}`}><Camera className="h-5 w-5" /></span>
          </div>
          <div className={`text-center text-3xl font-black text-brand transition-all duration-500 ${phase >= 2 ? 'opacity-100' : 'opacity-20'}`}>→</div>
          <div className="mx-auto w-full max-w-[17rem] space-y-2">
            <div className={`rounded-xl bg-white p-3 text-sm shadow ring-1 ring-slate-200 ${fade(phase >= 2)}`}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Read from the photo</p>
              <p className="mt-0.5 font-semibold text-slate-800">OxyNorm 5mg capsules</p>
              <p className="text-slate-600">Balance brought forward: <b className="text-slate-900">140</b></p>
            </div>
            <div className={`flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#2f6b3a] to-[#184B21] p-3 text-white shadow-lg ${fade(phase >= 3)}`}>
              <BookOpen className="h-8 w-8 flex-shrink-0 text-white/80" />
              <div><p className="text-sm font-bold">OxyNorm 5mg capsules</p><p className="text-xs text-white/75">New book · line 1: brought forward 140</p></div>
              <span className="ml-auto text-xl font-extrabold">140</span>
            </div>
            <p className={`text-center text-xs font-semibold text-brand-dark ${fade(phase >= 4)}`}>✓ Signed by the pharmacist with their PIN</p>
          </div>
        </div>
      </Frame>
    </div>
  );
}
