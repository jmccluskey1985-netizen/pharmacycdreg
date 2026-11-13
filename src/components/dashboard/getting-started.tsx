'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useStaff } from './staff-context';
import { can } from '@/lib/roles';

interface Step { key: string; label: string; done: boolean; href: string }
const KEY = 'cdreg-getting-started-hidden';

/** First-week checklist (supervising pharmacist). Disappears when everything's done, or when hidden. */
export function GettingStarted() {
  const { staff } = useStaff();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(KEY) === '1'); } catch { setHidden(false); }
    if (staff && can.manageStaff(staff.role)) api('/api/onboarding').then((d) => setSteps(d.steps)).catch(() => {});
  }, [staff]);
  if (hidden || !steps || steps.every((s) => s.done)) return null;
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="card mb-6 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Getting started <span className="text-sm font-normal text-muted-foreground">· {done} of {steps.length} done</span></h2>
          <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        </div>
        <button onClick={() => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } }} className="btn-ghost px-2 py-1" aria-label="Hide checklist"><X className="h-4 w-4" /></button>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted ${s.done ? 'text-muted-foreground line-through' : ''}`}>
              {s.done ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-brand" /> : <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground" />} {s.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">New to it? See <Link href="/dashboard/help" className="font-semibold text-primary underline">Help</Link> for 1-minute guides.</p>
    </section>
  );
}
