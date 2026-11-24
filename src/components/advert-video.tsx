'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';

/**
 * Landing page explainer video. Tablets and computers get the widescreen cut, which starts muted
 * when it scrolls into view and pauses when it leaves; "Tap for sound" restarts it with the voiceover.
 * Phones get the vertical cut and only play when tapped, so nobody downloads ~9 MB on mobile data
 * without choosing to. No autoplay for "reduce motion" or data-saver users.
 */
export function AdvertVideo() {
  const wide = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false); // true while it's autoplaying without sound

  useEffect(() => {
    const v = wide.current;
    if (!v || typeof IntersectionObserver === 'undefined') return;
    const big = window.matchMedia('(min-width: 640px)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!big || calm || saveData) return;

    let stopped = false; // the viewer paused it themselves: leave it alone from then on
    let ours = false; // the next pause event is ours (scrolled away), not the viewer's
    const onPause = () => { if (ours) ours = false; else if (!v.ended) stopped = true; };
    v.addEventListener('pause', onPause);
    const io = new IntersectionObserver(([e]) => {
      if (stopped) return;
      if (e.isIntersecting && v.paused) {
        v.muted = true;
        setMuted(true);
        v.play().catch(() => setMuted(false));
      } else if (!e.isIntersecting && !v.paused) {
        ours = true;
        v.pause();
      }
    }, { threshold: 0.5 });
    io.observe(v);
    const onVolume = () => { if (!v.muted) setMuted(false); };
    v.addEventListener('volumechange', onVolume);
    return () => { io.disconnect(); v.removeEventListener('pause', onPause); v.removeEventListener('volumechange', onVolume); };
  }, []);

  const withSound = () => {
    const v = wide.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = false;
    setMuted(false);
    v.play().catch(() => {});
  };

  return (
    <div className="relative mt-6 overflow-hidden rounded-2xl bg-black shadow-soft ring-1 ring-border">
      <video ref={wide} className="hidden aspect-video w-full sm:block" controls playsInline preload="none" poster="/video/advert-poster.jpg" aria-label="Explainer video">
        <source src="/video/pharmacycdreg-advert.mp4" type="video/mp4" />
      </video>
      {muted && (
        <button type="button" onClick={withSound}
          className="absolute left-4 top-4 hidden items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-brand-dark shadow-lg ring-1 ring-black/10 transition hover:bg-white sm:inline-flex">
          <Volume2 className="h-4 w-4" /> Tap for sound
        </button>
      )}
      <video className="mx-auto block aspect-[9/16] w-full max-w-sm sm:hidden" controls playsInline preload="none" poster="/video/advert-poster-vertical.jpg" aria-label="Explainer video">
        <source src="/video/pharmacycdreg-advert-vertical.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
