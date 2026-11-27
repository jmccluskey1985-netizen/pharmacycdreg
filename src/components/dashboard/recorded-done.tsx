'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { BookOpen, ChevronRight, ScanLine } from 'lucide-react';

/** One book a scan was recorded into, for the "done" panel. */
export interface UpdatedBook { id: string; label: string; change: number; unit: string; balance: number | null }

/**
 * A short "ting": two soft bell tones made in the browser (no sound file). Quiet, and silent where
 * the browser blocks audio. `big` adds a third, higher note for "all done".
 */
export function ting(big = false) {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = big ? [1318.5, 1760, 2637] : [1568, 2093];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t = ctx.currentTime + i * 0.09;
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.95);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch { /* no sound is fine */ }
}

/** The green tick: the circle pops in, a ring pulses out, then the tick draws itself. */
export function DoneTick({ size = 72 }: { size?: number }) {
  return (
    <span className="done-tick relative inline-flex flex-shrink-0" style={{ width: size, height: size }} aria-hidden>
      <span className="done-ring absolute inset-0 rounded-full bg-brand/40" />
      <svg viewBox="0 0 52 52" className="relative h-full w-full">
        <circle className="done-circle" cx="26" cy="26" r="25" fill="#2f9e44" />
        <path className="done-path" d="M15 27 l7.5 7.5 L38 19" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const qty = (n: number) => n.toLocaleString('en-IE', { maximumFractionDigits: 3 });

/** Shown when every line of a scan is recorded: tick, ting, and the books it went into (tap to open). */
export function RecordedDone({ books, onScanNext }: { books: UpdatedBook[]; onScanNext: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ting(true);
    ref.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }, []);
  return (
    <div ref={ref} className="card mt-6 scroll-mb-28 border-brand/40 bg-brand/5 text-center" role="status">
      <DoneTick />
      <p className="mt-3 text-xl font-bold">Recorded</p>
      <p className="text-sm text-muted-foreground">{books.length === 1 ? 'This book was updated.' : `${books.length} books were updated.`} Tap one to open it.</p>
      <ul className="mx-auto mt-4 grid max-w-md gap-2 text-left">
        {books.map((b, i) => (
          <li key={b.id} className="done-row" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
            <Link href={`/dashboard/register/${b.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition hover:border-brand hover:shadow">
              <BookOpen className="h-5 w-5 flex-shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{b.label}</span>
                <span className="block text-xs text-muted-foreground">
                  <b className={b.change >= 0 ? 'text-brand-dark dark:text-brand' : 'text-foreground'}>{sign(b.change)} {b.unit}</b>
                  {b.balance != null && <> · balance now <b className="text-foreground">{qty(b.balance)}</b></>}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/dashboard" className="btn-secondary">All registers</Link>
        <button onClick={onScanNext} className="btn-brand"><ScanLine className="h-4 w-4" /> Scan next</button>
      </div>
    </div>
  );
}
