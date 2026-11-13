'use client';

import { useEffect, useRef, useState } from 'react';

/** Fades and slides content up the first time it scrolls into view (like PharmacyConsultation.ie). */
export function FadeIn({ children, delay = 0, className = '', as: Tag = 'div' }: { children: React.ReactNode; delay?: number; className?: string; as?: 'div' | 'p' | 'li' }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as any} style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${shown ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'} ${className}`}>
      {children}
    </Tag>
  );
}

/** One phrase at a time, gently swapped every few seconds. Still for reduced-motion users. */
export function RotatingWords({ words, interval = 2600, className = '' }: { words: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      setOut(true);
      setTimeout(() => { setI((x) => (x + 1) % words.length); setOut(false); }, 350);
    }, interval);
    return () => clearInterval(t);
  }, [words.length, interval]);
  return (
    <span className={`relative inline-block ${className}`} aria-live="polite">
      <span className={`inline-block transition-all duration-300 ease-out ${out ? '-translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}>{words[i]}</span>
    </span>
  );
}

/** Light-green ticks that draw themselves in one after another when the list scrolls into view. */
export function TickList({ items, className = '' }: { items: string[]; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <ul ref={ref} className={`ticks grid gap-x-6 gap-y-2.5 sm:grid-cols-2 ${on ? 'on' : ''} ${className}`}>
      {items.map((t, i) => (
        <li key={t} className="tick-item flex items-center gap-2.5 text-[15px] font-medium" style={{ ['--d' as any]: `${i * 180}ms` }}>
          <svg viewBox="0 0 24 24" className="h-6 w-6 flex-shrink-0" aria-hidden="true">
            <circle className="tick-circle" cx="12" cy="12" r="11" fill="rgb(84 189 80 / .16)" />
            <path className="tick-path" d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#54BD50" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
