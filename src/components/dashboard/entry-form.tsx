'use client';

import { useMemo, useState } from 'react';
import { Loader2, PackagePlus, PackageMinus, Flame, Undo2, PencilLine } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

export type EntryType = 'receipt' | 'supply' | 'destruction' | 'patient_return' | 'patient_return_destruction' | 'correction';

export interface EntryDraft {
  entry_type: EntryType;
  transaction_date: string;
  quantity: number | string;
  supplier_name?: string | null;
  supplier_address?: string | null;
  recipient_name?: string | null;
  recipient_address?: string | null;
  prescriber_name?: string | null;
  prescriber_address?: string | null;
  authority_to_possess?: string | null;
  prescription_ref?: string | null;
  collected_by?: string | null;
  collector_id_checked?: boolean | null;
  witness_name?: string | null;
  witness_role?: string | null;
  destruction_method?: string | null;
  notes?: string | null;
  scan_id?: string | null;
  corrects_entry_id?: string;
  correction_reason?: string;
}

const TYPES: { value: EntryType; label: string; icon: any; hint: string }[] = [
  { value: 'receipt', label: 'Obtained', icon: PackagePlus, hint: 'Received into stock (e.g. from wholesaler)' },
  { value: 'supply', label: 'Supplied', icon: PackageMinus, hint: 'Supplied to a patient or other person' },
  { value: 'destruction', label: 'Destroyed', icon: Flame, hint: 'Witnessed destruction of pharmacy stock' },
  { value: 'patient_return', label: 'Patient return', icon: Undo2, hint: 'Returned by patient — kept separate from stock' },
];

export const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  registerId: string;
  unit: string;
  balance: number;
  initial?: Partial<EntryDraft>;
  /** Correction mode: the original entry being amended. */
  correcting?: { id: string; seq: number; entry_type: EntryType };
  lockType?: boolean;
  submitLabel?: string;
  onSaved: (result: { id: string; seq: number; balance: number }) => void;
  onCancel?: () => void;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EntryForm({ registerId, unit, balance, initial, correcting, lockType, submitLabel, onSaved, onCancel }: Props) {
  const [d, setD] = useState<EntryDraft>({
    entry_type: correcting ? correcting.entry_type : 'receipt',
    transaction_date: today(),
    quantity: '',
    ...initial,
  });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof EntryDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const type = d.entry_type;

  const preview = useMemo(() => {
    const q = Number(d.quantity) || 0;
    if (correcting) return null;
    if (type === 'receipt') return balance + q;
    if (type === 'supply' || type === 'destruction') return balance - q;
    return balance;
  }, [d.quantity, type, balance, correcting]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...d, register_id: registerId, quantity: Number(d.quantity) };
      if (correcting) {
        body.entry_type = 'correction';
        body.corrects_entry_id = correcting.id;
        body.correction_reason = reason;
      }
      for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
      const res = await api('/api/entries', { method: 'POST', json: body });
      onSaved(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the entry');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!correcting && !lockType && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setD({ ...d, entry_type: t.value })}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-medium transition ${type === t.value ? 'border-brand bg-brand/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              <t.icon className="h-5 w-5" /> {t.label}
            </button>
          ))}
        </div>
      )}
      {correcting && (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <PencilLine className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>Correcting line {correcting.seq}. The original stays in the register, struck through, with a footnote showing who corrected it, when and why.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of transaction"><input type="date" className="input" required value={d.transaction_date} max={today()} onChange={set('transaction_date')} /></Field>
        <Field label={`Amount (${unit})`}>
          <input type="number" inputMode="decimal" step="any" min={correcting ? 0 : 0.001} className="input text-lg font-semibold" required value={d.quantity} onChange={set('quantity')} />
        </Field>
      </div>

      {type === 'receipt' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Obtained from (name)"><input className="input" required value={d.supplier_name ?? ''} onChange={set('supplier_name')} placeholder="e.g. Wholesaler name" /></Field>
          <Field label="Address"><input className="input" required value={d.supplier_address ?? ''} onChange={set('supplier_address')} /></Field>
          <Field label="Invoice / docket no." ><input className="input" value={d.notes ?? ''} onChange={set('notes')} /></Field>
        </div>
      )}

      {type === 'supply' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplied to (name)"><input className="input" required value={d.recipient_name ?? ''} onChange={set('recipient_name')} /></Field>
            <Field label="Address"><input className="input" required value={d.recipient_address ?? ''} onChange={set('recipient_address')} /></Field>
            <Field label="Prescriber name"><input className="input" value={d.prescriber_name ?? ''} onChange={set('prescriber_name')} /></Field>
            <Field label="Prescriber address"><input className="input" value={d.prescriber_address ?? ''} onChange={set('prescriber_address')} /></Field>
            <Field label="Authority to be in possession" hint="Prescription / requisition reference"><input className="input" value={d.authority_to_possess ?? ''} onChange={set('authority_to_possess')} placeholder="e.g. Prescription — Dr A. Byrne" /></Field>
            <Field label="Rx / reference no."><input className="input" value={d.prescription_ref ?? ''} onChange={set('prescription_ref')} /></Field>
            <Field label="Collected by"><input className="input" value={d.collected_by ?? ''} onChange={set('collected_by')} placeholder="Patient / representative" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[#54BD50]" checked={!!d.collector_id_checked} onChange={(e) => setD({ ...d, collector_id_checked: e.target.checked })} />
            Collector&apos;s identity checked
          </label>
        </>
      )}

      {(type === 'destruction' || type === 'patient_return_destruction') && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Witness name"><input className="input" required value={d.witness_name ?? ''} onChange={set('witness_name')} /></Field>
          <Field label="Witness capacity" hint="e.g. Authorised officer, PSI inspector, Garda"><input className="input" required value={d.witness_role ?? ''} onChange={set('witness_role')} /></Field>
          <Field label="Method of destruction"><input className="input" value={d.destruction_method ?? ''} onChange={set('destruction_method')} placeholder="e.g. Denaturing kit" /></Field>
          {type === 'patient_return_destruction' && <Field label="Returned by (patient)"><input className="input" value={d.recipient_name ?? ''} onChange={set('recipient_name')} /></Field>}
        </div>
      )}

      {type === 'patient_return' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Returned by (patient name)"><input className="input" required value={d.recipient_name ?? ''} onChange={set('recipient_name')} /></Field>
          <Field label="Address"><input className="input" value={d.recipient_address ?? ''} onChange={set('recipient_address')} /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Patient returns are not pharmacy stock and do not change the balance. Record their destruction separately once witnessed.</p>
        </div>
      )}

      {correcting && (
        <Field label="Reason for correction"><textarea className="input min-h-[80px]" required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Quantity entered as 100 ml; 50 ml was dispensed" /></Field>
      )}

      {preview !== null && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${preview < 0 ? 'bg-destructive/10 text-destructive' : 'bg-secondary'}`}>
          <span>Balance after this entry</span>
          <span className="text-lg font-bold tabular-nums">{Number.isFinite(preview) ? preview : '—'} {unit}</span>
        </div>
      )}
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>}
        <button className="btn-primary flex-1" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel ?? (correcting ? 'Record correction' : 'Sign & record entry')}</button>
      </div>
    </form>
  );
}
