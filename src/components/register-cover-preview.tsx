'use client';

import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/logo';

/**
 * Landing page: the cover of a Register of Controlled Drugs (in the familiar paper-register
 * style) that turns open when it scrolls into view, revealing a register page.
 * No regulator's logo is used — PharmacyCDReg.ie is independent.
 */
export function RegisterCoverPreview({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setOpen(true); return; }
    let t: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { t = setTimeout(() => setOpen(true), 700); io.disconnect(); } }, { threshold: 0.55 });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);

  return (
    <div ref={ref} className="book-stage" style={{ containerType: 'inline-size' }}>
      <div className={`book ${open ? 'open' : ''}`}>
        <button type="button" onClick={() => setOpen(true)} aria-label="Open the register" aria-hidden={open} tabIndex={open ? -1 : 0}
          className="book-cover flex flex-col overflow-hidden bg-[#eceef0] text-left">
          <div className="flex flex-1 flex-col justify-end px-[6%] pb-[3%]">
            <p className="text-right text-[4.3cqw] font-bold uppercase leading-tight tracking-wide text-[#16477a]">Register of Controlled Drugs</p>
            <p className="mt-[1%] text-right text-[2.25cqw] text-slate-700">for recording the obtaining and supplying of Schedule 2 controlled drugs</p>
            <p className="mt-[1.5%] text-right text-[1.55cqw] text-slate-700">Includes a <b>Controlled Drugs Witnessed Destruction Record</b> section for recording the destruction of Schedule 2 controlled drugs</p>
          </div>
          <div className="h-[2.4%] bg-[#5f93b3]" />
          <div className="relative flex h-[34%] items-end justify-end bg-gradient-to-br from-[#147aa3] to-[#0e5f86] p-[4%]">
            <span className="flex items-center gap-2 text-white"><span className="block w-[4.5cqw] min-w-[18px]"><LogoMark size={30} className="h-auto w-full" /></span><span className="text-[2.1cqw] font-semibold">PharmacyCDReg.ie</span></span>
          </div>
          <div className="h-[13%] bg-[#eceef0]" />
          {!open && <span className="absolute bottom-[4%] left-[5%] rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#16477a] shadow">Tap to open</span>}
        </button>
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="w-full" />
        </div>
      </div>
    </div>
  );
}
