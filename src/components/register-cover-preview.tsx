'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Landing page: the PharmacyCDReg.ie register cover, which slowly turns open when it scrolls
 * into view (or is tapped) to reveal a register page underneath.
 */
export function RegisterCoverPreview({ src, alt, cover = '/previews/register-cover.webp', delay = 1200 }: { src: string; alt: string; cover?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setOpen(true); return; }
    let t: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { t = setTimeout(() => setOpen(true), delay); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [delay]);

  return (
    <div ref={ref} className="book-stage">
      <div className={`book book-slow ${open ? 'open' : ''}`}>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open the register" aria-hidden={open} tabIndex={open ? -1 : 0} className="book-cover overflow-hidden bg-[#eceef0]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="Register of Controlled Drugs — PharmacyCDReg.ie" className="h-full w-full object-cover object-bottom" />
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
