'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Repeat } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

export interface SupplyLine {
  id: string; seq: number; transaction_date: string; quantity: string | number;
  recipient_name: string | null; recipient_address: string | null;
  prescriber_name: string | null; prescriber_address: string | null;
  authority_to_possess: string | null; prescription_ref: string | null; patient_id?: string | null;
  register_id?: string; label?: string; unit?: string; // set when lines span several registers (dispensing reminders)
}

type Status = { state: 'idle' | 'saving' | 'saved' | 'dup' | 'error'; message?: string; level?: 'block' | 'warn' };
interface Row { src: SupplyLine; qty: string; ref: string; reason: string; status: Status }

const today = () => new Date().toISOString().slice(0, 10);
// "Prescription — Dr A. Walsh (Reg 012345), dated 05/11/26" → without the old date
const cleanAuthority = (a: string | null) => (a ?? '').replace(/,?\s*dated \d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i, '').trim() || null;

/**
 * Repeat selected supplies for today (typical repeat prescriptions): one table to check,
 * each line signed with the user's PIN session. The prescription number is left blank —
 * a Schedule 2 supply needs its own prescription, and re-using the old number would be
 * caught as a duplicate.
 */
export function RepeatSupplies({ registerId, unit, balance, balances, lines, onDone, onCancel, onAllSaved }: { registerId?: string; unit: string; balance: number; balances?: Record<string, number>; lines: SupplyLine[]; onDone: () => void; onCancel: () => void; onAllSaved?: (count: number) => Promise<void> | void }) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>(lines.map((src) => ({ src, qty: String(Number(src.quantity)), ref: '', reason: '', status: { state: 'idle' } })));
  const [busy, setBusy] = useState(false);
  const upd = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const pending = rows.filter((r) => r.status.state !== 'saved');
  const total = pending.reduce((n, r) => n + (Number(r.qty) || 0), 0);
  // Balance after, per register (several registers when recording a dispensing reminder).
  const afterBy: Record<string, { label: string; unit: string; after: number }> = {};
  for (const r of pending) {
    const id = r.src.register_id ?? registerId ?? '';
    const a = (afterBy[id] ||= { label: r.src.label ?? '', unit: r.src.unit ?? unit, after: balances?.[id] ?? balance });
    a.after -= Number(r.qty) || 0;
  }
  const multi = Object.keys(afterBy).length > 1 || !!balances;
  const after = multi ? Math.min(0, ...Object.values(afterBy).map((a) => a.after)) : balance - total;

  async function saveRow(i: number, override = false, lateReason?: string) {
    const r = rows[i];
    upd(i, { status: { state: 'saving' } });
    try {
      await api('/api/entries', { method: 'POST', json: {
        register_id: r.src.register_id ?? registerId, entry_type: 'supply', transaction_date: date, quantity: Number(r.qty),
        recipient_name: r.src.recipient_name, recipient_address: r.src.recipient_address,
        prescriber_name: r.src.prescriber_name, prescriber_address: r.src.prescriber_address,
        authority_to_possess: cleanAuthority(r.src.authority_to_possess), prescription_ref: r.ref.trim() || null,
        patient_id: r.src.patient_id ?? null,
        ...(override ? { allow_duplicate: true, duplicate_reason: r.reason } : {}),
        ...(lateReason ? { late_reason: lateReason } : {}),
      } });
      upd(i, { status: { state: 'saved' } });
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LATE_ENTRY' && !lateReason) {
        const why = window.prompt(e.message);
        if (why && why.trim().length >= 5) return saveRow(i, override, why.trim());
      }
      if (e instanceof ApiError && (e.code === 'DUPLICATE' || e.code === 'POSSIBLE_DUPLICATE')) {
        upd(i, { status: { state: 'dup', message: e.message, level: e.code === 'DUPLICATE' ? 'block' : 'warn' } });
      } else {
        upd(i, { status: { state: 'error', message: e instanceof ApiError ? e.message : 'Could not record' } });
      }
      return false;
    }
  }

  async function saveAll() {
    setBusy(true);
    let ok = true;
    for (let i = 0; i < rows.length; i++) if (rows[i].status.state !== 'saved') ok = (await saveRow(i)) && ok;
    setBusy(false);
    if (ok) { await onAllSaved?.(rows.length); setTimeout(onDone, 600); }
  }

  const done = rows.every((r) => r.status.state === 'saved');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Same patient, address and prescriber as before. Check each amount and enter the <b>new prescription’s</b> reference.</p>
        <label className="flex items-center gap-2 text-sm">Date supplied <input type="date" className="input w-auto py-1.5" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.src.id} className={`rounded-xl border p-3 text-sm ${r.status.state === 'saved' ? 'border-brand/50 bg-brand/5' : r.status.state === 'dup' || r.status.state === 'error' ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950' : 'border-border'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {r.src.label && <p className="text-xs font-bold uppercase tracking-wide text-primary">{r.src.label}</p>}
                <p className="font-semibold">{r.src.recipient_name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.src.recipient_address}</p>
                <p className="text-xs text-muted-foreground">{cleanAuthority(r.src.authority_to_possess) ?? r.src.prescriber_name ?? 'No prescriber recorded'} {r.src.seq ? ` · last supplied line ${r.src.seq}` : ''}</p>
              </div>
              {r.status.state === 'saved' && <span className="flex items-center gap-1 font-semibold text-brand"><CheckCircle2 className="h-4 w-4" /> Recorded</span>}
            </div>
            {r.status.state !== 'saved' && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
                <label className="text-xs text-muted-foreground">Amount ({r.src.unit ?? unit})<input className="input mt-0.5 py-1.5 font-semibold" type="number" min="0.001" step="any" inputMode="decimal" value={r.qty} onChange={(e) => upd(i, { qty: e.target.value })} /></label>
                <label className="text-xs text-muted-foreground">New prescription / Rx reference<input className="input mt-0.5 py-1.5" value={r.ref} onChange={(e) => upd(i, { ref: e.target.value })} placeholder="e.g. GMS 88412 or Rx 10331" /></label>
              </div>
            )}
            {(r.status.state === 'dup' || r.status.state === 'error') && (
              <div className="mt-2 space-y-2 text-amber-950 dark:text-amber-100">
                <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {r.status.message}</p>
                {r.status.state === 'dup' && (
                  <div className="flex flex-wrap gap-2">
                    <input className="input flex-1 py-1.5" value={r.reason} onChange={(e) => upd(i, { reason: e.target.value })} placeholder="Why this isn’t a duplicate, e.g. new prescription dated today" />
                    <button type="button" disabled={r.reason.trim().length < 5} onClick={() => saveRow(i, true)} className="btn-primary py-1.5 text-sm">Record anyway</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {!done && !multi && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${after < 0 ? 'bg-destructive/10 text-destructive' : 'bg-secondary'}`}>
          <span>Balance after these {pending.length} supplies</span>
          <span className="text-lg font-bold tabular-nums">{after} {unit}</span>
        </div>
      )}
      {!done && multi && (
        <div className="space-y-1 rounded-lg bg-secondary px-4 py-3 text-sm">
          {Object.entries(afterBy).map(([id, a]) => (
            <p key={id} className={`flex justify-between gap-2 ${a.after < 0 ? 'font-semibold text-destructive' : ''}`}><span>{a.label} — balance after</span><b className="tabular-nums">{a.after} {a.unit}</b></p>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={done ? onDone : onCancel} className="btn-secondary flex-1">{done ? 'Close' : 'Cancel'}</button>
        {!done && <button type="button" onClick={saveAll} disabled={busy || after < 0 || pending.some((r) => !(Number(r.qty) > 0))} className="btn-primary flex-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />} Sign &amp; record {pending.length > 1 ? `all ${pending.length}` : ''}</button>}
      </div>
    </div>
  );
}
