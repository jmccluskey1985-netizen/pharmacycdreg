'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, onLocked } from '@/lib/api';
import type { StaffRole } from '@/lib/roles';

export interface ActiveStaff { id: string; full_name: string; role: StaffRole; psi_number: string | null }
export interface Pharmacy {
  id: string; name: string; address: string; psi_premises_number: string | null;
  subscription_status: string | null; trial_ends_at: string | null; current_period_end: string | null; cancel_at_period_end: boolean; halo_enabled?: boolean; lock_minutes?: number; locum_default_days?: number;
}

interface Ctx {
  loading: boolean;
  pharmacy: Pharmacy | null;
  staff: ActiveStaff | null;
  locked: boolean;
  hasPins: boolean;
  inboxCount: number;
  refresh: () => Promise<void>;
  lock: () => Promise<void>;
  setStaff: (s: ActiveStaff) => void;
}

const StaffContext = createContext<Ctx | null>(null);

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ loading: true, pharmacy: null as Pharmacy | null, staff: null as ActiveStaff | null, locked: true, hasPins: true, inboxCount: 0 });

  const refresh = useCallback(async () => {
    try {
      const d = await api('/api/staff/me');
      setState({ loading: false, pharmacy: d.pharmacy, staff: d.staff, locked: d.locked, hasPins: d.hasPins, inboxCount: d.inboxCount ?? 0 });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const lock = useCallback(async () => {
    await fetch('/api/staff/lock', { method: 'POST' });
    setState((s) => ({ ...s, staff: null, locked: true }));
  }, []);

  useEffect(() => {
    refresh();
    const off = onLocked(() => setState((s) => ({ ...s, staff: null, locked: true })));
    return () => { off(); };
  }, [refresh]);

  // Mirror the server's idle lock (Settings → Security) so a walked-away screen locks itself.
  const idleMs = (state.pharmacy?.lock_minutes ?? 15) * 60 * 1000;
  useEffect(() => {
    if (state.locked) return;
    let timer = setTimeout(lock, idleMs);
    const bump = () => { clearTimeout(timer); timer = setTimeout(lock, idleMs); };
    const events = ['pointerdown', 'keydown'];
    events.forEach((e) => window.addEventListener(e, bump));
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, bump)); };
  }, [state.locked, lock, idleMs]);

  return (
    <StaffContext.Provider value={{ ...state, refresh, lock, setStaff: (s) => setState((st) => ({ ...st, staff: s, locked: false })) }}>
      {children}
    </StaffContext.Provider>
  );
}

export function useStaff() {
  const c = useContext(StaffContext);
  if (!c) throw new Error('useStaff outside StaffProvider');
  return c;
}
