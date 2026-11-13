'use client';
import { useStaff } from '@/components/dashboard/staff-context';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ROLE_LABELS, type StaffRole } from '@/lib/roles';
import { Modal } from '@/components/modal';

interface Member { id: string; full_name: string; role: StaffRole; psi_number: string | null; is_active: boolean; access_expires_at: string | null; has_pin: boolean }

// NFR1–NFR3 + locum workflow: individual users, roles, PINs, temporary access.
export default function TeamPage() {
  const [staff, setStaff] = useState<Member[]>([]);
  const [editing, setEditing] = useState<Partial<Member> | null>(null);
  const load = useCallback(() => api('/api/staff').then((d) => setStaff(d.staff)), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-sm text-muted-foreground">Everyone signs register entries with their own PIN.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/billing" className="btn-secondary lg:hidden">Billing</Link>
          <button onClick={() => setEditing({ role: 'pharmacist', is_active: true })} className="btn-primary"><Plus className="h-4 w-4" /> Add</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((s) => {
          const expired = s.access_expires_at && new Date(s.access_expires_at) < new Date();
          return (
            <button key={s.id} onClick={() => setEditing(s)} className={`card text-left transition hover:shadow-md ${!s.is_active || expired ? 'opacity-60' : ''}`}>
              <p className="font-semibold">{s.full_name}</p>
              <p className="text-sm text-muted-foreground">{ROLE_LABELS[s.role]}{s.psi_number ? ` · PSI ${s.psi_number}` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!s.is_active && <span className="badge bg-muted">Inactive</span>}
                {!s.has_pin && <span className="badge bg-amber-100 text-amber-900">No PIN</span>}
                {s.access_expires_at && <span className={`badge ${expired ? 'bg-red-100 text-red-800' : 'bg-sky-100 text-sky-900'}`}>{expired ? 'Expired' : 'Until'} {new Date(s.access_expires_at).toLocaleDateString('en-IE')}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit staff member' : 'Add staff member'}>
        {editing && <StaffForm initial={editing} onDone={() => { setEditing(null); load(); }} />}
      </Modal>
    </div>
  );
}

function StaffForm({ initial, onDone }: { initial: Partial<Member>; onDone: () => void }) {
  const { pharmacy } = useStaff();
  const [f, setF] = useState({
    full_name: initial.full_name ?? '',
    role: (initial.role ?? 'pharmacist') as StaffRole,
    psi_number: initial.psi_number ?? '',
    pin: '',
    access_expires_at: initial.access_expires_at ? initial.access_expires_at.slice(0, 10) : '',
    is_active: initial.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pharmacistRole = ['supervising_pharmacist', 'pharmacist', 'locum_pharmacist'].includes(f.role);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/staff', {
        method: 'POST',
        json: {
          id: initial.id,
          full_name: f.full_name,
          role: f.role,
          psi_number: f.psi_number || null,
          pin: f.pin || undefined,
          access_expires_at: f.access_expires_at ? new Date(f.access_expires_at + 'T23:59:59').toISOString() : null,
          is_active: f.is_active,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div><label className="label">Full name</label><input className="input" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
      <div><label className="label">Role</label>
        <select className="input" value={f.role} onChange={(e) => {
          const role = e.target.value as StaffRole;
          // Locums get a default end date from Settings → Security.
          const days = pharmacy?.locum_default_days ?? 14;
          const until = role === 'locum_pharmacist' && !f.access_expires_at ? new Date(Date.now() + days * 864e5).toISOString().slice(0, 10) : f.access_expires_at;
          setF({ ...f, role, access_expires_at: until });
        }}>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {pharmacistRole && <div><label className="label">PSI registration number</label><input className="input" required inputMode="numeric" value={f.psi_number} onChange={(e) => setF({ ...f, psi_number: e.target.value })} /></div>}
      <div><label className="label">{initial.id ? 'New PIN (leave blank to keep)' : 'PIN (4–6 digits)'}</label><input className="input font-mono tracking-widest" type="password" inputMode="numeric" pattern="\d{4,6}" required={!initial.id} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></div>
      <div><label className="label">Access ends (optional: for locums)</label><input className="input" type="date" value={f.access_expires_at} onChange={(e) => setF({ ...f, access_expires_at: e.target.value })} /></div>
      {initial.id && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Active</label>
      )}
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
    </form>
  );
}
