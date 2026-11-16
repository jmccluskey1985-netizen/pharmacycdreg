'use client';

import { Camera, CheckCircle2, Loader2, Sparkles, ArrowRight, Tags } from 'lucide-react';
import { usePhases, HAND, SampleNote } from '@/components/landing-demos';

/**
 * How OST onboarding works, as a looping animation: photograph bag labels → the list is read →
 * saved as the OST list → later, an unclear handwritten form is matched by its treatment card.
 * Every name, code and address here is made up.
 */
const PEOPLE = [
  { name: 'Declan FARRELL', code: 'F12', addr: '12 Abbey Court, Ennis', card: 'PH 4417', rot: '-rotate-3' },
  { name: 'Niamh CORCORAN', code: 'C27', addr: '9 Oak Park, Clarecastle', card: 'PH 5390', rot: 'rotate-2' },
  { name: 'Gerard LYNCH', code: 'L33', addr: '4 Mill Road, Ennis', card: 'PH 5121', rot: 'rotate-1' },
  { name: 'Paddy HEHIR', code: 'H51', addr: '21 Bridge Street, Ennis', card: 'PH 6008', rot: '-rotate-2' },
];
const STEPS = ['Photograph the bag labels', 'Check the list', 'Saved as your OST list', 'Unclear form? Still matched'];
const DUR = [2000, 400, 1300, 3600, 900, 2600, 4200];
const stepOf = (p: number) => (p <= 2 ? 0 : p <= 4 ? 1 : p === 5 ? 2 : 3);
const show = (on: boolean) => `transition-all duration-500 ${on ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`;

function BagLabel({ p }: { p: (typeof PEOPLE)[number] }) {
  return (
    <div className={`w-[9.5rem] rounded-sm bg-white px-2 py-1.5 font-mono text-[8.5px] leading-snug text-slate-800 shadow-md ring-1 ring-slate-300 ${p.rot}`}>
      <p className="text-right text-slate-500">16/11/2026</p>
      <p className="font-bold">{p.name} ({p.code})</p>
      <p>{p.addr}</p>
      <p className="mt-1 border-t border-dashed border-slate-300 pt-0.5 text-slate-500">Non Chargeable</p>
    </div>
  );
}

export function OstOnboardDemo({ compact = false }: { compact?: boolean }) {
  const { ref, phase } = usePhases(DUR);
  const step = stepOf(phase);
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
      {/* Step chips */}
      <ol className="grid grid-cols-2 gap-1 border-b border-border bg-muted/40 p-2 text-[11px] sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors ${i === step ? 'bg-brand/15 font-semibold text-brand-dark' : 'text-muted-foreground'}`}>
            <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${i === step ? 'bg-brand text-white' : i < step ? 'bg-brand/30 text-brand-dark' : 'bg-muted text-muted-foreground'}`}>{i < step ? '✓' : i + 1}</span>{s}
          </li>
        ))}
      </ol>

      <div className={`relative ${compact ? 'h-64' : 'h-72'} bg-gradient-to-b from-secondary/60 to-background`} aria-hidden="true">
        {/* 1. Labels on the counter, camera frame */}
        {phase <= 1 && (
          <div className="absolute inset-0 bg-gradient-to-br from-stone-500 to-stone-700">
            <div className="absolute inset-0 grid grid-cols-2 place-items-center gap-1 p-6">
              {PEOPLE.map((p) => <BagLabel key={p.code} p={p} />)}
            </div>
            <div className="pointer-events-none absolute inset-3 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,.35)]">
              {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl'].map((c) => <span key={c} className={`absolute h-7 w-7 border-brand ${c}`} />)}
              <span className="demo-sweep absolute inset-x-2 h-0.5 bg-brand/80 shadow-[0_0_12px_2px_rgba(84,189,80,.7)]" />
            </div>
            <p className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white"><Camera className="mr-1 inline h-3 w-3" />One label per patient, several per photo</p>
            {phase === 1 && <div className="demo-flash absolute inset-0 bg-white" />}
          </div>
        )}

        {/* Reading */}
        {phase === 2 && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex -space-x-16 scale-75">{PEOPLE.map((p) => <BagLabel key={p.code} p={p} />)}</div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Reading 4 labels…</p>
          </div>
        )}

        {/* 2. The list to check */}
        {(phase === 3 || phase === 4) && (
          <div className="flex h-full flex-col p-3 text-[11px]">
            <p className="flex items-center gap-1.5 text-xs font-bold"><Sparkles className="h-3.5 w-3.5 text-brand" /> 4 patients found <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-normal">Product for everyone: <b>Methadone DTF 1mg/ml</b></span></p>
            <div className="mt-2 space-y-1">
              {PEOPLE.map((p, i) => (
                <div key={p.code} className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 shadow-sm ring-1 ring-border sm:grid-cols-[1.2fr_1.4fr_auto_auto] ${show(true)}`} style={{ transitionDelay: phase === 3 ? `${i * 300}ms` : '0ms' }}>
                  <span className="font-semibold">{p.name.replace(/(\w+)$/, (s) => s[0] + s.slice(1).toLowerCase())} <span className="ml-1 rounded bg-slate-100 px-1 font-mono text-[9px] text-slate-600">{p.code}</span></span>
                  <span className="hidden truncate text-muted-foreground sm:block">{p.addr}</span>
                  <span className="hidden rounded border border-border px-1.5 font-mono text-[10px] sm:block">{p.card}</span>
                  <span className={`rounded-full px-2 text-[9px] font-semibold ${i === 2 ? 'bg-sky-100 text-sky-900' : 'bg-brand/15 text-brand-dark'}`}>{i === 2 ? 'Existing record' : 'New'}</span>
                </div>
              ))}
            </div>
            <span className={`mt-auto flex h-9 items-center justify-center rounded-lg bg-brand-dark text-xs font-semibold text-white transition-transform duration-150 ${phase === 4 ? 'scale-95 ring-4 ring-brand/30' : ''}`}>Save 4 to the OST list</span>
          </div>
        )}

        {/* 3. Saved */}
        {phase === 5 && (
          <div className="flex h-full flex-col p-3 text-[11px]">
            <p className="flex items-center gap-1.5 text-xs font-bold"><Tags className="h-3.5 w-3.5 text-brand" /> Patients · OST patients</p>
            <div className="mt-2 overflow-hidden rounded-lg bg-card ring-1 ring-border">
              {PEOPLE.map((p, i) => (
                <div key={p.code} className={`flex items-center gap-2 border-t border-border px-2.5 py-1.5 first:border-t-0 ${show(true)}`} style={{ transitionDelay: `${i * 120}ms` }}>
                  <span className="font-semibold">{p.name.replace(/(\w+)$/, (s) => s[0] + s.slice(1).toLowerCase())}</span>
                  <span className="rounded-full bg-violet-100 px-1.5 text-[9px] font-bold text-violet-900">OST</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{p.card} · {p.code}</span>
                </div>
              ))}
            </div>
            <p className="mt-auto flex items-center gap-1.5 font-semibold text-brand-dark"><CheckCircle2 className="h-4 w-4 text-brand" /> Saved once. Done.</p>
          </div>
        )}

        {/* 4. An unclear form is still matched */}
        {phase === 6 && (
          <div className="flex h-full items-center justify-center gap-3 p-3 text-[11px]">
            <div className="w-[44%] -rotate-2 rounded-md bg-[#c6b9da] p-2 shadow-md">
              <p className="text-[7px] font-bold uppercase text-[#45366a]">Surname / first name</p>
              <p className="rounded-sm bg-white px-1 text-[13px] text-slate-700 blur-[0.6px]" style={HAND}>D. Farel</p>
              <p className="mt-1 text-[7px] font-bold uppercase text-[#45366a]">Address</p>
              <p className="rounded-sm bg-white px-1 text-[11px] text-slate-600 blur-[0.8px]" style={HAND}>Abby Ct ~ ?</p>
              <p className="mt-1 text-[7px] font-bold uppercase text-[#45366a]">Treatment card no.</p>
              <p className="rounded-sm bg-white px-1 font-mono text-[11px] font-bold text-slate-800">PH <span style={HAND}>4417</span></p>
            </div>
            <ArrowRight className="h-5 w-5 flex-shrink-0 text-brand" />
            <div className={`w-[46%] rounded-lg bg-card p-2.5 shadow-sm ring-2 ring-brand/40 ${show(true)}`}>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Patient</p>
              <p className="text-sm font-bold">Declan Farrell</p>
              <p className="text-muted-foreground">12 Abbey Court, Ennis</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-brand"><CheckCircle2 className="h-3 w-3" /> Treatment card PH 4417 matches</p>
              <p className="flex items-center gap-1 text-[10px] font-semibold text-brand"><CheckCircle2 className="h-3 w-3" /> On your OST list · Methadone DTF</p>
            </div>
          </div>
        )}
      </div>
      <SampleNote className="px-3 pb-2 pt-1.5" />
    </div>
  );
}
