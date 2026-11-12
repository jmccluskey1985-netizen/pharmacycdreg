'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { QuickFillInput } from './quickfill-input';

export interface PatientRecord {
  id: string; first_name: string; surname: string; date_of_birth: string | null; address: string | null; phone: string | null;
  gms_number: string | null; ihi_number: string | null; gp_name: string | null; gp_address: string | null; notes: string | null;
}

const split = (name: string) => { const t = name.trim().replace(/\s+/g, ' '); const i = t.lastIndexOf(' '); return i < 0 ? { first_name: t, surname: '' } : { first_name: t.slice(0, i), surname: t.slice(i + 1) }; };

/** Same fields as PharmacyConsultation.ie's patient record. */
export function PatientForm({ initial, typedName, onSaved, onArchived }: { initial?: Partial<PatientRecord>; typedName?: string; onSaved: (p: PatientRecord) => void; onArchived?: () => void }) {
  const fromTyped = typedName ? split(typedName) : null;
  const [f, setF] = useState({
    first_name: initial?.first_name ?? fromTyped?.first_name ?? '', surname: initial?.surname ?? fromTyped?.surname ?? '',
    date_of_birth: initial?.date_of_birth ?? '', address: initial?.address ?? '', phone: initial?.phone ?? '',
    gms_number: initial?.gms_number ?? '', ihi_number: initial?.ihi_number ?? '', gp_name: initial?.gp_name ?? '', gp_address: initial?.gp_address ?? '', notes: initial?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const json = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' && k !== 'surname' ? null : v]));
    try {
      const d = initial?.id ? await api(`/api/patients/${initial.id}`, { method: 'PATCH', json }) : await api('/api/patients', { method: 'POST', json });
      onSaved(d.patient);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!initial?.id || !confirm('Remove this patient from the list? Their register entries are kept.')) return;
    await api(`/api/patients/${initial.id}`, { method: 'PATCH', json: { archive: true } });
    onArchived?.();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">First name</label><input className="input" required value={f.first_name} onChange={set('first_name')} autoFocus /></div>
        <div><label className="label">Surname</label><input className="input" value={f.surname} onChange={set('surname')} /></div>
        <div><label className="label">Date of birth</label><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={f.date_of_birth ?? ''} onChange={set('date_of_birth')} /></div>
        <div><label className="label">Phone</label><input className="input" type="tel" value={f.phone ?? ''} onChange={set('phone')} /></div>
      </div>
      <div><label className="label">Address</label><input className="input" value={f.address ?? ''} onChange={set('address')} autoComplete="off" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">GMS (medical card) no.</label><input className="input" value={f.gms_number ?? ''} onChange={set('gms_number')} /></div>
        <div><label className="label">IHI no. <span className="font-normal text-muted-foreground">(optional)</span></label><input className="input" value={f.ihi_number ?? ''} onChange={set('ihi_number')} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Usual doctor</label><QuickFillInput kind="prescriber" value={f.gp_name ?? ''} onChange={(v) => setF({ ...f, gp_name: v })} onPick={(p) => setF({ ...f, gp_name: p.name, gp_address: p.address ?? f.gp_address })} placeholder="Name or GMS no." /></div>
        <div><label className="label">Doctor’s practice address</label><input className="input" value={f.gp_address ?? ''} onChange={set('gp_address')} /></div>
      </div>
      <div><label className="label">Notes <span className="font-normal text-muted-foreground">(optional)</span></label><textarea className="input min-h-[70px]" value={f.notes ?? ''} onChange={set('notes')} placeholder="e.g. Representative collects; ID seen" /></div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        {initial?.id && onArchived && <button type="button" onClick={archive} className="btn-ghost text-destructive">Remove</button>}
        <button className="btn-primary flex-1" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {initial?.id ? 'Save changes' : 'Save patient'}</button>
      </div>
    </form>
  );
}
