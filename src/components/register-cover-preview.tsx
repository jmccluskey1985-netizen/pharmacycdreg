'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Landing page: the PharmacyCDReg.ie register cover. Once it's fully in view it stays shut for a
 * few seconds, then slowly turns open (or open it straight away with a tap) to reveal a register page.
 */
export function RegisterCoverPreview({ src, alt, cover = '/previews/register-cover.webp', delay = 3000 }: { src: string; alt: string; cover?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state (storage, URL, fetched data) read after hydration
    if (typeof IntersectionObserver === 'undefined') { setOpen(true); return; }
    // Wait until the whole cover is on screen, give people time to look at it, then open.
    // Scrolling away before then cancels the countdown, so it never opens unseen.
    let t: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      const fullyVisible = e.intersectionRatio >= 0.95 || (e.isIntersecting && e.boundingClientRect.height > window.innerHeight * 0.9 && e.intersectionRatio >= 0.8);
      if (fullyVisible && !t) t = setTimeout(() => { setOpen(true); io.disconnect(); }, delay);
      else if (!fullyVisible && t) { clearTimeout(t); t = undefined; }
    }, { threshold: [0, 0.5, 0.8, 0.95, 1] });
    io.observe(el);
    return () => { io.disconnect(); if (t) clearTimeout(t); };
  }, [delay]);

  return (
    <div ref={ref} className="book-stage">
      <div className={`book book-slow ${open ? 'open' : ''}`}>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open the register" aria-hidden={open} tabIndex={open ? -1 : 0} className="book-cover overflow-hidden bg-[#eceef0]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="Register of Controlled Drugs: PharmacyCDReg.ie" className="h-full w-full object-cover object-bottom" />
          {!open && <span className="absolute bottom-[5%] left-[4%] rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#16477a] shadow">Tap to open</span>}
        </button>
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="w-full" />
        </div>
      </div>
    </div>
  );
}
