'use client';

import { DEMO } from '@/lib/demo/flag';
import { installDemo, resetDemo } from '@/lib/demo/mock';

// Installed at module load (before any component effect fetches /api/*).
if (DEMO && typeof window !== 'undefined') installDemo();

export function DemoRibbon() {
  if (!DEMO) return null;
  return (
    <div className="no-print fixed left-1/2 top-2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-amber-950 shadow-lg">
      Demo · sample data · nothing is saved
      <button
        onClick={() => { resetDemo(); window.location.href = '/'; }}
        className="rounded-full bg-amber-950/10 px-2 py-0.5 hover:bg-amber-950/20"
      >
        Reset
      </button>
    </div>
  );
}
