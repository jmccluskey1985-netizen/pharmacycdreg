'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, Loader2, X } from 'lucide-react';
import { shutter, preloadShutter, soundOn } from '@/lib/sounds';

/**
 * Full-screen in-app camera with the green page frame (the same look as Scan), for photographing a
 * paper register page, bag labels or a note. Takes one photo (`multiple` false: returns straight
 * away) or several, then hands back JPEG files. If the camera can't start (no permission, no
 * camera, desktop) it falls back to the phone's photo picker.
 */
export function CameraCapture({ open, onClose, onPhotos, hint = 'Fill the frame with the whole page', multiple = false }: {
  open: boolean; onClose: () => void; onPhotos: (files: File[]) => void; hint?: string; multiple?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'starting' | 'on' | 'unavailable'>('starting');
  const [shots, setShots] = useState<File[]>([]);
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset each time the camera opens
    setShots([]); setState('starting');
    if (soundOn('shutter')) preloadShutter();
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('unavailable'); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        setState('on');
      } catch { if (!cancelled) setState('unavailable'); }
    })();
    return () => { cancelled = true; stop(); };
  }, [open, stop]);
  // No camera: go straight to the photo picker
  useEffect(() => { if (open && state === 'unavailable') pick.current?.click(); }, [open, state]);

  const finish = (files: File[]) => { stop(); onPhotos(files); };
  async function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    const scale = Math.min(1, 2000 / Math.max(v.videoWidth, v.videoHeight)); // small enough to upload
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    setFlash(true); shutter(); setTimeout(() => setFlash(false), 180);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    if (!blob) return;
    const file = new File([blob], `page-${shots.length + 1}.jpg`, { type: 'image/jpeg' });
    if (multiple) setShots((s) => [...s, file]); else finish([file]);
  }

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-label="Camera">
      <input ref={pick} type="file" accept="image/*,application/pdf" multiple={multiple} hidden
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) finish([...shots, ...f]); else if (state === 'unavailable') onClose(); }} />
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-3 bottom-32 top-14">
          <div className="relative h-full w-full rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,.45)]">
            {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl'].map((c) => (
              <span key={c} className={`absolute h-10 w-10 border-brand ${c}`} />
            ))}
            <span className="absolute inset-x-3 top-0 h-0.5 animate-[camsweep_2.4s_ease-in-out_infinite] bg-brand/80 shadow-[0_0_12px_2px_rgba(84,189,80,.7)]" />
          </div>
        </div>
        <div className="absolute inset-x-0 top-3 flex items-center justify-between gap-2 px-3">
          <button onClick={() => { stop(); onClose(); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Close camera"><X className="h-5 w-5" /></button>
          <p className="rounded-full bg-black/60 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur">{multiple && shots.length ? `Page ${shots.length + 1}: ` : ''}{hint}</p>
          <span className="w-10" />
        </div>
        {state === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>}
        {state === 'unavailable' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white"><p>The camera isn’t available here (allow camera access for this site, or choose a photo).</p><button onClick={() => pick.current?.click()} className="btn-brand">Choose a photo</button></div>}
        {flash && <div className="absolute inset-0 bg-white/80" />}
      </div>
      <div className="flex items-center justify-between bg-black px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <button onClick={() => pick.current?.click()} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white" aria-label="Choose from photos"><ImagePlus className="h-6 w-6" /></button>
        <button onClick={snap} disabled={state !== 'on'} className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 transition active:scale-90 disabled:opacity-50" aria-label="Take photo">
          <span className="h-14 w-14 rounded-full bg-white" />
        </button>
        {multiple && shots.length > 0
          ? <button onClick={() => finish(shots)} className="relative flex h-14 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-bold text-white" aria-label="Use these photos"><Check className="h-5 w-5" /> Done<span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-brand">{shots.length}</span></button>
          : <span className="w-12" />}
      </div>
      <style>{`@keyframes camsweep{0%,100%{top:4%}50%{top:94%}}`}</style>
    </div>,
    document.body,
  );
}

/** Phones and tablets use the in-app camera; computers use the file picker. */
export function useTouch() {
  const [touch, setTouch] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state (storage, URL, fetched data) read after hydration
  useEffect(() => setTouch(window.matchMedia('(pointer: coarse)').matches), []);
  return touch;
}
