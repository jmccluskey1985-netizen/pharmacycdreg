'use client';

import { useEffect, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { Modal } from '@/components/modal';
import { DEMO } from '@/lib/demo/flag';

const EVENT = 'cdreg-training';
const isOn = () => typeof window !== 'undefined' && !!(window as any).__cdregTraining;

/** True while this page is in training mode (re-renders when it starts). */
export function useTraining() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isOn());
    const f = () => setOn(isOn());
    window.addEventListener(EVENT, f);
    return () => window.removeEventListener(EVENT, f);
  }, []);
  return on;
}

async function startTraining(pharmacy: unknown) {
  const res = await fetch('/api/training/snapshot', { cache: 'no-store' });
  const snap = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(snap.error || 'Could not start training mode');
  const { installTraining } = await import('@/lib/demo/mock');
  installTraining(snap, pharmacy as any);
  window.dispatchEvent(new Event(EVENT));
}

/** The orange bar across the top of every page while training. */
export function TrainingBar() {
  const on = useTraining();
  if (!on) return null;
  return (
    <div className="no-print fixed inset-x-0 top-0 z-[70] flex h-9 items-center justify-center gap-3 bg-orange-500 px-3 text-xs font-bold text-white shadow sm:text-sm">
      <GraduationCap className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">TRAINING MODE: practice only. Nothing is saved to the real register.</span>
      <button onClick={() => window.location.reload()} className="flex-shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 hover:bg-white/30">End training</button>
    </div>
  );
}

/** Button + explanation to start training. */
export function TrainingButton({ pharmacy, onStarted, className, compact }: { pharmacy: unknown; onStarted?: () => void; className?: string; compact?: boolean }) {
  const on = useTraining();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (DEMO || on) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? 'btn-ghost w-full text-sm'} title="Practise on a copy of your register"><GraduationCap className="h-4 w-4" /> {compact ? '' : 'Training mode'}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Training mode">
        <div className="space-y-3 text-sm">
          <p>Practise on a <b>copy of your own registers</b>. Scanning, entries, corrections, stock checks, new CD books.</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>An orange <b className="text-orange-600">TRAINING MODE</b> bar shows on every page.</li>
            <li>Nothing goes into the real register. Photos are still read for real so you can practise scanning.</li>
            <li><b>Refresh the page</b> or press <b>End training</b> and every practice change is gone.</li>
          </ul>
          {error && <p className="text-destructive">{error}</p>}
          <button disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try { await startTraining(pharmacy); setOpen(false); onStarted?.(); }
            catch (e) { setError(e instanceof Error ? e.message : 'Could not start training mode'); }
            finally { setBusy(false); }
          }} className="w-full rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white hover:bg-orange-600">{busy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}Start training</button>
        </div>
      </Modal>
    </>
  );
}
