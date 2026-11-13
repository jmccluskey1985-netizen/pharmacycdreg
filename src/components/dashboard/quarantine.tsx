'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PackageX, Loader2, Undo2 } from 'lucide-react';
import { Modal } from '@/components/modal';
import { api, ApiError } from '@/lib/api';

export interface QItem { id: string; register_id: string; quantity: number; reason: string; batch: string | null; expiry_date: string | null; notes: string | null; status: string; created_at: string; label?: string; unit?: string; release_reason?: string | null }

const REASONS: Record<string, string> = { expired: 'Expired', damaged: 'Damaged', recalled: 'Recalled', other: 'Other' };
const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');

/**
 * Set Schedule 2 stock aside for destruction (expired / damaged): it stays in the CD safe,
 * segregated and labelled "CDs for destruction", and STAYS IN THE BALANCE until an authorised
 * person witnesses its destruction (recorded from the Destructions page).
 */
export function QuarantinePanel({ registerId, unit, balance, canRecord, onChanged }: { registerId: string; unit: string; balance: number; canRecord: boolean; onChanged?: () => void }) {
  const [items, setItems] = useState<QItem[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api(`/api/quarantine?register_id=${registerId}`).then((d) => { setItems(d.items); setNeedsMigration(!!d.needs_migration); }).catch(() => setItems([])), [registerId]);
  useEffect(() => { load(); }, [load]);
  const awaiting = (items ?? []).filter((i) => i.status === 'awaiting');
  const total = awaiting.reduce((n, i) => n + Number(i.quantity), 0);

  return (
    <>
      {canRecord && <button onClick={() => setOpen(true)} className="btn-secondary" title="Expired or damaged stock awaiting witnessed destruction"><PackageX className="h-4 w-4" /> Set aside</button>}
      {awaiting.length > 0 && (
        <div className="no-print order-last basis-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">{total} {unit} set aside for destruction — still in the balance until destroyed</p>
          <ul className="mt-1 space-y-1">
            {awaiting.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{Number(i.quantity)} {unit} · {REASONS[i.reason] ?? i.reason}{i.batch ? ` · batch ${i.batch}` : ''}{i.expiry_date ? ` · exp ${fmt(i.expiry_date)}` : ''} · since {new Date(i.created_at).toLocaleDateString('en-IE')}</span>
                {canRecord && <ReleaseButton id={i.id} onDone={() => { load(); onChanged?.(); }} />}
              </li>
            ))}
          </ul>
          <Link href="/dashboard/destructions" className="mt-1 inline-block font-semibold underline">Record the witnessed destruction →</Link>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Set aside for destruction">
        {open && <QuarantineForm registerId={registerId} unit={unit} available={balance - total} needsMigration={needsMigration} onDone={() => { setOpen(false); load(); onChanged?.(); }} />}
      </Modal>
    </>
  );
}

function QuarantineForm({ registerId, unit, available, needsMigration, onDone }: { registerId: string; unit: string; available: number; needsMigration: boolean; onDone: () => void }) {
  const [f, setF] = useState({ quantity: '', reason: 'expired', batch: '', expiry_date: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(needsMigration ? 'Needs a one-off database update first (migration 0011).' : null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api('/api/quarantine', { method: 'POST', json: { register_id: registerId, quantity: Number(f.quantity), reason: f.reason, batch: f.batch || null, expiry_date: f.expiry_date || null, notes: f.notes || null } }); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-muted-foreground">Keep it in the CD safe, <b>segregated and labelled “CDs for destruction”</b>. It stays in the register balance until an authorised person (Garda, PSI authorised officer) witnesses its destruction. Destroy promptly — don’t let it build up.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Amount ({unit})</label><input className="input text-lg font-semibold" type="number" min="0.001" max={available} step="any" inputMode="decimal" required value={f.quantity} onChange={set('quantity')} autoFocus /><p className="mt-1 text-xs text-muted-foreground">Up to {available} {unit}</p></div>
        <div><label className="label">Reason</label><select className="input" value={f.reason} onChange={set('reason')}>{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Batch <span className="font-normal text-muted-foreground">(optional)</span></label><input className="input" value={f.batch} onChange={set('batch')} /></div>
        <div><label className="label">Expiry <span className="font-normal text-muted-foreground">(optional)</span></label><input className="input" type="date" value={f.expiry_date} onChange={set('expiry_date')} /></div>
      </div>
      <div><label className="label">Notes <span className="font-normal text-muted-foreground">(optional)</span></label><input className="input" value={f.notes} onChange={set('notes')} placeholder="e.g. Blister damaged on delivery" /></div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || needsMigration}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Set aside for destruction</button>
    </form>
  );
}

function ReleaseButton({ id, onDone }: { id: string; onDone: () => void }) {
  return (
    <button type="button" className="flex items-center gap-1 text-xs font-semibold underline" onClick={async () => {
      const reason = prompt('Why is this going back into usable stock? (e.g. set aside by mistake — in date)');
      if (!reason || reason.trim().length < 5) return;
      try { await api(`/api/quarantine/${id}`, { method: 'PATCH', json: { reason } }); onDone(); } catch (e) { alert(e instanceof ApiError ? e.message : 'Could not release'); }
    }}><Undo2 className="h-3 w-3" /> Release</button>
  );
}
