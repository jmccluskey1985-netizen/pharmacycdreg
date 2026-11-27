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

/** A camera shutter: two short filtered clicks (shutter open, shutter close). */
export function shutter(force = false) {
  if (!force && !soundOn('shutter')) return;
  const ctx = audio();
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  [[0, 0.5, 3200], [0.075, 0.3, 2200]].forEach(([at, vol, hz]) => {
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = 0.9; g.gain.value = vol;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + at);
  });
  closeSoon(ctx);
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
