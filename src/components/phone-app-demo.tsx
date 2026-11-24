'use client';

import { Phone, MessageCircle, Mail, Camera, CalendarDays, Clock, Map, Settings, Image as ImageIcon, CloudSun, StickyNote, Calculator, Wifi, BatteryFull, Signal, Globe } from 'lucide-react';
import { usePhases, SampleNote } from '@/components/landing-demos';

/**
 * "Works on your phone": a phone home screen with the CDReg app icon among ordinary apps,
 * a tap, the app opening full screen, then the register page. Shows it's one tap away, like any
 * app. Generic icons only (no real app brands). Loops while on screen.
 */
const APPS: [string, typeof Phone, string, string][] = [
  ['Phone', Phone, 'bg-emerald-500', 'text-white'], ['Messages', MessageCircle, 'bg-green-500', 'text-white'], ['Mail', Mail, 'bg-sky-500', 'text-white'], ['Camera', Camera, 'bg-slate-500', 'text-white'],
  ['Calendar', CalendarDays, 'bg-white', 'text-rose-500'], ['Clock', Clock, 'bg-slate-900', 'text-white'], ['Maps', Map, 'bg-teal-500', 'text-white'], ['Photos', ImageIcon, 'bg-amber-400', 'text-white'],
  ['Weather', CloudSun, 'bg-blue-500', 'text-white'], ['CDREG', Phone, '', ''], ['Notes', StickyNote, 'bg-yellow-300', 'text-yellow-900'], ['Calculator', Calculator, 'bg-zinc-700', 'text-white'],
];
const DOCK: [typeof Phone, string][] = [[Phone, 'bg-emerald-500'], [Globe, 'bg-sky-500'], [MessageCircle, 'bg-green-500'], [Settings, 'bg-zinc-500']];
// Where the CD Register icon sits (column 2 of 4, row 3 of the grid), as % of the screen: for the tap and the zoom
const AT = { x: '39.5%', y: '54.5%' };

export function PhoneAppDemo({ className = '', note = true }: { className?: string; note?: boolean }) {
  const { ref, phase } = usePhases([1100, 650, 600, 800, 2900, 350]);
  const tap = phase === 1, opening = phase >= 2 && phase <= 4, splash = phase === 2 || phase === 3, app = phase === 4;
  return (
    <figure ref={ref} className={`mx-auto w-60 sm:w-64 ${className}`}>
      <div className="overflow-hidden rounded-[2.2rem] bg-black p-2 shadow-soft ring-1 ring-border" aria-hidden="true">
        <div className="relative aspect-[940/1600] overflow-hidden rounded-[1.8rem] bg-gradient-to-b from-[#1f5f3a] via-[#2d7a4b] to-[#7cc58a]">
          {/* Status bar */}
          <div className={`absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 pt-2 text-[10px] font-semibold transition-colors duration-300 ${app ? 'text-slate-900' : 'text-white'}`}>
            <span>09:15</span>
            <span className="absolute left-1/2 top-1.5 h-4 w-16 -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1"><Signal className="h-3 w-3" /><Wifi className="h-3 w-3" /><BatteryFull className="h-3.5 w-3.5" /></span>
          </div>

          {/* Home screen */}
          <div className="absolute inset-0 px-4 pt-12">
            <div className="grid grid-cols-4 gap-x-3 gap-y-4">
              {APPS.map(([name, I, bg, fg]) => name === 'CDREG' ? (
                <div key={name} className="flex flex-col items-center gap-1">
                  <span className={`block aspect-square w-full overflow-hidden rounded-[22%] shadow-md ring-2 transition-all duration-300 ${tap ? 'scale-90 ring-white' : 'scale-100 ring-white/0'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon-192.png" alt="" className="h-full w-full" />
                  </span>
                  <span className="w-full truncate text-center text-[8.5px] font-medium text-white drop-shadow">CDReg</span>
                </div>
              ) : (
                <div key={name} className="flex flex-col items-center gap-1">
                  <span className={`flex aspect-square w-full items-center justify-center rounded-[22%] shadow-md ${bg} ${fg}`}><I className="h-1/2 w-1/2" /></span>
                  <span className="w-full truncate text-center text-[8.5px] font-medium text-white/90 drop-shadow">{name}</span>
                </div>
              ))}
            </div>
            {/* Dock */}
            <div className="absolute inset-x-3 bottom-3 grid grid-cols-4 gap-3 rounded-[1.4rem] bg-white/25 p-2.5 backdrop-blur">
              {DOCK.map(([I, bg], i) => <span key={i} className={`flex aspect-square items-center justify-center rounded-[22%] text-white ${bg}`}><I className="h-1/2 w-1/2" /></span>)}
            </div>
          </div>

          {/* The tap */}
          <span className={`pointer-events-none absolute z-20 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 transition-all duration-300 ${tap ? 'scale-100 opacity-100' : 'scale-150 opacity-0'}`} style={{ left: AT.x, top: AT.y }} />

          {/* The app opening from its icon: splash, then the register */}
          <div className="absolute inset-0 z-10 overflow-hidden rounded-[1.8rem] bg-[#184B21] transition-all duration-500 ease-out"
            style={{ transformOrigin: `${AT.x} ${AT.y}`, transform: opening ? 'scale(1)' : 'scale(0.16)', opacity: opening ? 1 : 0 }}>
            <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 transition-opacity duration-300 ${splash ? 'opacity-100' : 'opacity-0'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-192.png" alt="" className="h-16 w-16 rounded-2xl" />
              <span className="text-sm font-bold text-white">CDReg</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className={`absolute inset-0 bg-white pt-7 transition-opacity duration-500 ${app ? 'opacity-100' : 'opacity-0'}`}><img src="/previews/phone.webp" alt="" loading="lazy" className="h-full w-full object-cover object-top" /></div>
          </div>
        </div>
      </div>
      {note && <figcaption><SampleNote className="mt-2 text-center" /></figcaption>}
    </figure>
  );
}
