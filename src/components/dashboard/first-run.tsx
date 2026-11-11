'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { LogoMark } from '@/components/logo';
import { useStaff } from './staff-context';

/** No staff yet: set up the supervising pharmacist (the only person who can add others). */
export function FirstRun() {
  const { pharmacy, refresh } = useStaff();
  const [f, setF] = useState({ full_name: '', psi_number: '', pin: '', pin2: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.pin !== f.pin2) return setError('PINs do not match');
    setBusy(true);
    setError(null);
    try {
      await api('/api/staff', { method: 'POST', json: { full_name: f.full_name, psi_number: f.psi_number, pin: f.pin, role: 'supervising_pharmacist' } });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={save} className="card w-full max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <LogoMark size={32} />
          <div>
            <h1 className="text-lg font-bold">Set up {pharmacy?.name}</h1>
            <p className="text-sm text-muted-foreground">Add the supervising pharmacist. They can then add the team.</p>
          </div>
        </div>
        {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div><label className="label">Full name</label><input className="input" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
        <div><label className="label">PSI registration number</label><input className="input" required inputMode="numeric" value={f.psi_number} onChange={(e) => setF({ ...f, psi_number: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">PIN (4–6 digits)</label><input className="input font-mono tracking-widest" required type="password" inputMode="numeric" pattern="\d{4,6}" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></div>
          <div><label className="label">Confirm PIN</label><input className="input font-mono tracking-widest" required type="password" inputMode="numeric" pattern="\d{4,6}" value={f.pin2} onChange={(e) => setF({ ...f, pin2: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></div>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save and continue</button>
      </form>
    </div>
  );
}
