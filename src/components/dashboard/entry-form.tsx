'use client';

import { useMemo, useState } from 'react';
import { isLate } from '@/lib/late-entry';
import { Loader2, PackagePlus, PackageMinus, Flame, Undo2, PencilLine } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { QuickFillInput, type Suggestion } from './quickfill-input';
import { PatientForm, type PatientRecord } from './patient-form';
import { Modal } from '@/components/modal';

export type EntryType = 'receipt' | 'supply' | 'destruction' | 'patient_return' | 'patient_return_destruction' | 'adjustment_in' | 'adjustment_out' | 'correction';

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
  inbox_id?: string | null;
  patient_id?: string | null;
  patient_dob?: string | null;
  corrects_entry_id?: string;
  correction_reason?: string;
}

const TYPES: { value: EntryType; label: string; icon: any; hint: string }[] = [
  { value: 'receipt', label: 'Obtained', icon: PackagePlus, hint: 'Received into stock (e.g. from wholesaler)' },
  { value: 'supply', label: 'Supplied', icon: PackageMinus, hint: 'Supplied to a patient or other person' },
  { value: 'destruction', label: 'Destroyed', icon: Flame, hint: 'Witnessed destruction of pharmacy stock' },
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
  const [lateReason, setLateReason] = useState('');
  const [requisition, setRequisition] = useState(false);
  const late = !correcting && isLate(d.transaction_date);
  const [newPatient, setNewPatient] = useState<string | null>(null);
  const fromRecord = (p: PatientRecord) => pickPatient({ name: `${p.first_name} ${p.surname}`.trim(), address: p.address, source: 'patient', patient_id: p.id, dob: p.date_of_birth, usual_prescriber: p.gp_name ? { name: p.gp_name, address: p.gp_address } : null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Server flagged this as the same invoice / prescription as an existing line.
  const [dup, setDup] = useState<{ level: 'block' | 'warn'; message: string } | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [dupReason, setDupReason] = useState('');
  const set = (k: keyof EntryDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const type = d.entry_type;
  const setVal = (k: keyof EntryDraft) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  const pickSupplier = (p: Suggestion) => setD((x) => ({ ...x, supplier_name: p.name, supplier_address: p.address ?? x.supplier_address }));
  // Picking a known patient also fills their usual doctor (from their latest supply), if not set yet.
  const pickPatient = (p: Suggestion) => setD((x) => {
    const doc = p.usual_prescriber && x.entry_type === 'supply' && !x.prescriber_name ? p.usual_prescriber : null;
    return {
      ...x,
      patient_id: p.patient_id ?? null,
      recipient_name: p.name,
      recipient_address: p.address ?? x.recipient_address,
      ...(doc ? { prescriber_name: doc.name, prescriber_address: doc.address ?? x.prescriber_address, authority_to_possess: x.authority_to_possess || `Prescription: ${doc.name}` } : {}),
    };
  });
  const pickWitness = (p: Suggestion) => setD((x) => ({ ...x, witness_name: p.name, witness_role: p.role ?? x.witness_role }));
  const pickPrescriber = (p: Suggestion) =>
    setD((x) => ({
      ...x,
      prescriber_name: p.name,
      prescriber_address: p.address ?? x.prescriber_address,
      authority_to_possess: x.authority_to_possess || `Prescription: ${p.name}${p.registration ? ` (Reg ${p.registration})` : p.gms_number ? ` (GMS ${p.gms_number})` : ''}`,
    }));

  const preview = useMemo(() => {
    const q = Number(d.quantity) || 0;
    if (correcting) return null;
    if (type === 'receipt') return balance + q;
    if (type === 'supply' || type === 'destruction') return balance - q;
    return balance;
  }, [d.quantity, type, balance, correcting]);

  async function submit(e?: React.FormEvent, override = false) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    if (!override) { setDup(null); setOverriding(false); }
    try {
      const body: Record<string, unknown> = { ...d, register_id: registerId, quantity: Number(d.quantity), ...(override ? { allow_duplicate: true, duplicate_reason: dupReason } : {}), ...(late ? { late_reason: lateReason } : {}), ...(type === 'supply' && requisition ? { requisition: true, patient_id: null } : {}) };
      if (correcting) {
        body.entry_type = 'correction';
        body.corrects_entry_id = correcting.id;
        body.correction_reason = reason;
      }
      for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
      const res = await api('/api/entries', { method: 'POST', json: body });
      setDup(null); setOverriding(false); setDupReason('');
      onSaved(res);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'DUPLICATE' || err.code === 'POSSIBLE_DUPLICATE') && err.status === 409) {
        setDup({ level: err.code === 'DUPLICATE' ? 'block' : 'warn', message: err.message });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not save the entry');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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

      {late && (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">Late entry: this transaction is more than a day old</p>
          <input className="input" required minLength={5} value={lateReason} onChange={(e) => setLateReason(e.target.value)} placeholder="Why it’s being entered now, e.g. system down: entered from the paper fallback sheet" />
          <p className="text-xs opacity-80">The reason is printed on the register line.</p>
        </div>
      )}

      {type === 'receipt' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Obtained from (name)"><QuickFillInput kind="supplier" required value={d.supplier_name ?? ''} onChange={setVal('supplier_name')} onPick={pickSupplier} placeholder="Start typing, e.g. United" /></Field>
          <Field label="Address"><input className="input" required value={d.supplier_address ?? ''} onChange={set('supplier_address')} /></Field>
          <Field label="Invoice / docket no." ><input className="input" value={d.notes ?? ''} onChange={set('notes')} /></Field>
        </div>
      )}

      {type === 'supply' && !correcting && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm">
          <button type="button" onClick={() => { setRequisition(false); }} className={`rounded-lg px-2 py-1.5 font-semibold ${!requisition ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>To a patient (prescription)</button>
          <button type="button" onClick={() => { setRequisition(true); setD((x) => ({ ...x, patient_id: null, authority_to_possess: x.authority_to_possess?.startsWith('Requisition') ? x.authority_to_possess : 'Requisition: signed by ' })); }} className={`rounded-lg px-2 py-1.5 font-semibold ${requisition ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>On a requisition</button>
        </div>
      )}
      {type === 'supply' && requisition && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplied to (practitioner / business)"><input className="input" required minLength={2} value={d.recipient_name ?? ''} onChange={set('recipient_name')} placeholder="e.g. Dr J. Walsh, Shannon Medical Centre" /></Field>
          <Field label="Address"><input className="input" required value={d.recipient_address ?? ''} onChange={set('recipient_address')} /></Field>
          <Field label="Authority to be in possession" hint="Who signed the requisition and in what capacity"><input className="input" required value={d.authority_to_possess ?? ''} onChange={set('authority_to_possess')} /></Field>
          <Field label="Requisition no. / date"><input className="input" value={d.prescription_ref ?? ''} onChange={set('prescription_ref')} /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Keep the signed requisition on file. Requisitions for Schedule 2 drugs must be signed by the recipient and state their name, address, profession, purpose and total quantity.</p>
        </div>
      )}
      {type === 'supply' && !requisition && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplied to (name)"><QuickFillInput kind="patient" required value={d.recipient_name ?? ''} onChange={(v) => setD((x) => ({ ...x, recipient_name: v, patient_id: null }))} onPick={pickPatient} onCreate={setNewPatient} createLabel="New patient" placeholder="Name, DOB (dd/mm/yyyy) or GMS no." /></Field>
            <Field label="Address"><input className="input" required value={d.recipient_address ?? ''} onChange={set('recipient_address')} /></Field>
            <Field label="Prescriber name"><QuickFillInput kind="prescriber" value={d.prescriber_name ?? ''} onChange={setVal('prescriber_name')} onPick={pickPrescriber} placeholder="Name, IMC or GMS no." /></Field>
            <Field label="Prescriber address"><input className="input" value={d.prescriber_address ?? ''} onChange={set('prescriber_address')} /></Field>
            <Field label="Authority to be in possession" hint="Prescription / requisition reference"><input className="input" value={d.authority_to_possess ?? ''} onChange={set('authority_to_possess')} placeholder="e.g. Prescription: Dr A. Byrne" /></Field>
            <Field label="Rx / reference no."><input className="input" value={d.prescription_ref ?? ''} onChange={set('prescription_ref')} /></Field>
            <Field label="Collected by">
              <input className="input" value={d.collected_by ?? ''} onChange={set('collected_by')} placeholder="Patient / representative" />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {['Patient', 'Representative', 'Delivered'].map((c) => (
                  <button key={c} type="button" onClick={() => setD((x) => ({ ...x, collected_by: c }))} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${d.collected_by === c ? 'border-brand bg-brand text-white' : 'border-border hover:border-brand'}`}>{c}</button>
                ))}
              </div>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[#54BD50]" checked={!!d.collector_id_checked} onChange={(e) => setD({ ...d, collector_id_checked: e.target.checked })} />
            Collector&apos;s identity checked
          </label>
        </>
      )}

      {(type === 'destruction' || type === 'patient_return_destruction') && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Witness name"><QuickFillInput kind="witness" required value={d.witness_name ?? ''} onChange={setVal('witness_name')} onPick={pickWitness} /></Field>
          <Field label="Witness capacity" hint="e.g. Authorised officer, PSI inspector, Garda"><input className="input" required value={d.witness_role ?? ''} onChange={set('witness_role')} /></Field>
          <Field label="Method of destruction"><input className="input" value={d.destruction_method ?? ''} onChange={set('destruction_method')} placeholder="e.g. Denaturing kit" /></Field>
          {type === 'patient_return_destruction' && <Field label="Returned by (patient)"><input className="input" value={d.recipient_name ?? ''} onChange={set('recipient_name')} /></Field>}
        </div>
      )}

      {type === 'patient_return' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Returned by (patient name)"><QuickFillInput kind="patient" required value={d.recipient_name ?? ''} onChange={(v) => setD((x) => ({ ...x, recipient_name: v, patient_id: null }))} onPick={pickPatient} onCreate={setNewPatient} createLabel="New patient" /></Field>
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
          <span className="text-lg font-bold tabular-nums">{Number.isFinite(preview) ? preview : '-'} {unit}</span>
        </div>
      )}
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {dup && (
        <div className={`space-y-2 rounded-lg border p-3 text-sm ${dup.level === 'block' ? 'border-destructive/40 bg-destructive/10' : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100'}`}>
          <p className="font-semibold">{dup.level === 'block' ? 'This looks like a duplicate: not recorded' : 'Possible duplicate: not recorded yet'}</p>
          <p>{dup.message}</p>
          {!overriding ? (
            <div className="flex flex-wrap gap-2">
              {onCancel && <button type="button" onClick={onCancel} className="btn-secondary py-1.5 text-sm">Don’t record it</button>}
              <button type="button" onClick={() => setOverriding(true)} className="btn-ghost py-1.5 text-sm underline">It’s a separate {d.entry_type === 'receipt' ? 'delivery' : 'supply'}…</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input className="input" value={dupReason} onChange={(e) => setDupReason(e.target.value)} placeholder={d.entry_type === 'receipt' ? 'e.g. Second delivery on a separate docket' : 'e.g. New prescription, dated today, Rx 10412'} autoFocus />
              <button type="button" disabled={busy || dupReason.trim().length < 5} onClick={() => submit(undefined, true)} className="btn-primary py-1.5 text-sm">Record anyway: reason saved in audit trail</button>
            </div>
          )}
        </div>
      )}

      {/* Kept on screen while scrolling, so Sign & record never needs a scroll to reach */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex gap-3 rounded-xl bg-card/95 px-1 py-2 backdrop-blur lg:bottom-0">
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>}
        <button className="btn-primary flex-1" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel ?? (correcting ? 'Record correction' : 'Sign & record entry')}</button>
      </div>
    </form>
      <Modal open={newPatient !== null} onClose={() => setNewPatient(null)} title="New patient">
        {newPatient !== null && <PatientForm typedName={newPatient} onSaved={(p) => { setNewPatient(null); fromRecord(p); }} />}
      </Modal>
    </>
  );
}
