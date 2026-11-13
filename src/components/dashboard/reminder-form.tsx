'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { productTitle } from '@/lib/product-name';
import { FREQUENCIES, type Frequency } from '@/lib/reminders';
import { QuickFillInput } from './quickfill-input';

export interface RLine { register_id: string; quantity: number | string; recipient_name: string; recipient_address: string; prescriber_name?: string | null; prescriber_address?: string | null; authority_to_possess?: string | null; patient_id?: string | null }
export interface ReminderData { id?: string; title: string; frequency: Frequency; interval_days?: number | null; next_due: string; notes?: string | null; lines: RLine[] }

const today = () => new Date().toISOString().slice(0, 10);
const blank = (register_id = ''): RLine => ({ register_id, quantity: '', recipient_name: '', recipient_address: '', prescriber_name: '', prescriber_address: '' });
const cleanAuthority = (a?: string | null) => (a ?? '').replace(/,?\s*dated \d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i, '').trim() || null;

/** Create / edit a dispensing reminder: how often, from when, and which supplies to record. */
export function ReminderForm({ initial, onSaved, onCancel }: { initial?: Partial<ReminderData>; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState<ReminderData>({
    title: initial?.title ?? '', frequency: initial?.frequency ?? 'weekly', interval_days: initial?.interval_days ?? 7,
    next_due: initial?.next_due ?? today(), notes: initial?.notes ?? '',
    lines: initial?.lines?.length ? initial.lines.map((l) => ({ ...l, authority_to_possess: cleanAuthority(l.authority_to_possess) })) : [blank()],
  });
  const [regs, setRegs] = useState<{ id: string; label: string; unit: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api('/api/registers').then((d) => setRegs(d.registers.map((r: any) => ({ id: r.id, label: productTitle(r.product), unit: r.product.unit })))).catch(() => {}); }, []);
  const setLine = (i: number, patch: Partial<RLine>) => setF((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const title = f.title || Array.from(new Set(f.lines.map((l) => l.recipient_name).filter(Boolean))).join(', ');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const json = { ...f, title, interval_days: f.frequency === 'custom' ? Number(f.interval_days) : null, notes: f.notes || null, lines: f.lines.map((l) => ({ ...l, quantity: Number(l.quantity), prescriber_name: l.prescriber_name || null, prescriber_address: l.prescriber_address || null, authority_to_possess: l.authority_to_possess || null, patient_id: l.patient_id || null })) };
    try {
      if (initial?.id) await api(`/api/reminders/${initial.id}`, { method: 'PATCH', json });
      else await api('/api/reminders', { method: 'POST', json });
      onSaved();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3"><label className="label">Name</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={title || 'e.g. Mary Byrne — weekly methadone'} /></div>
        <div><label className="label">How often</label><select className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Frequency })}>{Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {f.frequency === 'custom' && <div><label className="label">Every (days)</label><input className="input" type="number" min={1} max={366} required value={f.interval_days ?? ''} onChange={(e) => setF({ ...f, interval_days: Number(e.target.value) })} /></div>}
        <div><label className="label">{initial?.id ? 'Next due' : 'First due'}</label><input className="input" type="date" required value={f.next_due} onChange={(e) => setF({ ...f, next_due: e.target.value })} /></div>
      </div>

      <div className="space-y-3">
        <p className="label">Supplies to record</p>
        {f.lines.map((l, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex gap-2">
              <select className="input flex-1" required value={l.register_id} onChange={(e) => setLine(i, { register_id: e.target.value })}><option value="">Choose the register…</option>{regs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
              <input className="input w-28 font-semibold" type="number" min="0.001" step="any" inputMode="decimal" required placeholder={regs.find((r) => r.id === l.register_id)?.unit ?? 'Amount'} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label="Amount" />
              {f.lines.length > 1 && <button type="button" onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })} className="btn-ghost px-2" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <QuickFillInput kind="patient" required value={l.recipient_name} placeholder="Patient" onChange={(v) => setLine(i, { recipient_name: v, patient_id: null })}
                onPick={(p) => setLine(i, { recipient_name: p.name, recipient_address: p.address ?? l.recipient_address, patient_id: p.patient_id ?? null, ...(p.usual_prescriber && !l.prescriber_name ? { prescriber_name: p.usual_prescriber.name, prescriber_address: p.usual_prescriber.address } : {}) })} />
              <input className="input" required minLength={3} placeholder="Patient address" value={l.recipient_address} onChange={(e) => setLine(i, { recipient_address: e.target.value })} />
              <QuickFillInput kind="prescriber" value={l.prescriber_name ?? ''} placeholder="Prescriber" onChange={(v) => setLine(i, { prescriber_name: v })} onPick={(p) => setLine(i, { prescriber_name: p.name, prescriber_address: p.address })} />
              <input className="input" placeholder="Prescriber address" value={l.prescriber_address ?? ''} onChange={(e) => setLine(i, { prescriber_address: e.target.value })} />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setF({ ...f, lines: [...f.lines, blank(f.lines[f.lines.length - 1]?.register_id)] })} className="btn-ghost text-sm"><Plus className="h-4 w-4" /> Add another supply</button>
      </div>
      <div><label className="label">Notes <span className="font-normal text-muted-foreground">(optional)</span></label><input className="input" value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Collected by daughter; check new Rx every 4 weeks" /></div>
      <p className="text-xs text-muted-foreground">When it’s due, you’ll see a reminder. One click records every supply — each one still signed by you and checked for balance and duplicates.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button className="btn-primary flex-1" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {initial?.id ? 'Save' : 'Set up reminder'}</button>
      </div>
    </form>
  );
}
