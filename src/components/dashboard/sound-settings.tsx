'use client';

import { useEffect, useState } from 'react';
import { Camera, Volume2, VolumeX } from 'lucide-react';
import { soundOn, setSound, shutter, ting, type SoundKey } from '@/lib/sounds';

const ROWS: { k: SoundKey; label: string; text: string; icon: typeof Camera; play: () => void }[] = [
  { k: 'shutter', label: 'Camera sound', text: 'A shutter click when you photograph a prescription or invoice.', icon: Camera, play: () => shutter(true) },
  { k: 'chime', label: 'Recorded chime', text: 'A short ting when a line is recorded in a book.', icon: Volume2, play: () => ting(true, true) },
];

/** Settings → This device: switch each sound on or off on its own (kept on this device). */
export function SoundSettings() {
  const [on, setOn] = useState<Record<SoundKey, boolean> | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state (storage, URL, fetched data) read after hydration
  useEffect(() => setOn({ shutter: soundOn('shutter'), chime: soundOn('chime') }), []);
  if (!on) return null;
  return (
    <div className="card divide-y divide-border p-0">
      {ROWS.map(({ k, label, text, icon: I, play }) => (
        <div key={k} className="flex items-center gap-3 px-5 py-4">
          {on[k] ? <I className="h-5 w-5 text-brand" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{label}</p>
            <p className="text-sm text-muted-foreground">{text} <button type="button" onClick={play} className="font-semibold text-primary underline">Play</button></p>
          </div>
          <button type="button" role="switch" aria-checked={on[k]} aria-label={label}
            onClick={() => { const v = !on[k]; setSound(k, v); setOn({ ...on, [k]: v }); if (v) play(); }}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${on[k] ? 'bg-brand' : 'bg-muted-foreground/30'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on[k] ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      ))}
    </div>
  );
}
