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
