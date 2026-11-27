'use client';

/**
 * Small sounds made in the browser (Web Audio, no sound files): the camera shutter when a page is
 * photographed and the chime when lines are recorded. Each can be switched off on its own in
 * Settings → This device; the choice is kept on this device only. Silent wherever the browser
 * blocks audio or the phone is on silent.
 */
export type SoundKey = 'shutter' | 'chime';
const KEY = 'cdreg-sounds';

export function soundOn(k: SoundKey): boolean {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>)[k] !== false; } catch { return true; }
}
export function setSound(k: SoundKey, on: boolean) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY) ?? '{}'), [k]: on })); } catch { /* private mode: stays on */ }
}

function audio(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return AC ? new AC() : null;
  } catch { return null; }
}
const closeSoon = (ctx: AudioContext) => setTimeout(() => ctx.close().catch(() => {}), 1500);

/** An old-school camera shutter ("ka-chunk"): a short recording made for the app, /sounds/shutter.mp3 (9 KB). */
let shutterEl: HTMLAudioElement | null = null;
export function shutter(force = false) {
  if (!force && !soundOn('shutter')) return;
  try {
    shutterEl ??= Object.assign(new Audio('/sounds/shutter.mp3'), { preload: 'auto' });
    const a = shutterEl.paused ? shutterEl : (shutterEl.cloneNode() as HTMLAudioElement); // quick repeat shots overlap
    a.currentTime = 0;
    a.volume = 0.8;
    a.play().catch(() => {});
  } catch { /* no sound is fine */ }
}

/** Load the shutter sound ahead of the first photo (the scanner calls this when the camera opens). */
export function preloadShutter() {
  try { shutterEl ??= Object.assign(new Audio('/sounds/shutter.mp3'), { preload: 'auto' }); shutterEl.load(); } catch { /* ignore */ }
}

/** A soft bell "ting"; `big` adds a higher third note for "all done". */
export function ting(big = false, force = false) {
  if (!force && !soundOn('chime')) return;
  const ctx = audio();
  if (!ctx) return;
  (big ? [1318.5, 1760, 2637] : [1568, 2093]).forEach((f, i) => {
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
  closeSoon(ctx);
}
