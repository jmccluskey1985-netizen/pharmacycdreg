'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Inbox, Undo2, FilePen } from 'lucide-react';
import { can } from '@/lib/roles';
import { api, ApiError } from '@/lib/api';
import { useStaff } from '@/components/dashboard/staff-context';
import { EntryForm } from '@/components/dashboard/entry-form';

interface Item {
  id: string;
  action: 'dispense' | 'reverse';
  problem: string | null;
  received_at: string;
  payload: any;
  register_id: string | null;
  balance: number | null;
  candidates: { id: string; label: string; unit: string }[];
}

// "To confirm": register entries drafted by the team (e.g. technicians) and CD supplies sent from
// Halo. A pharmacist checks and signs each one into the register with their PIN.
export default function InboxPage() {
  const { refresh, staff, pharmacy } = useStaff();
  const [items, setItems] = useState<Item[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const load = useCallback(() => {
    api('/api/inbox').then((d) => setItems(d.items)).catch(() => setItems([]));
    api('/api/entries/drafts').then((d) => setDrafts(d.drafts)).catch(() => setDrafts([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = async () => { await load(); refresh(); };
  const signer = !!staff && can.record(staff.role);
  const loading = items === null || drafts === null;
  const empty = !loading && !items!.length && !drafts!.length;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">To confirm</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {signer ? 'Entries waiting for a pharmacist: drafts from your team' : 'Your drafts, waiting for a pharmacist to check and sign'}{pharmacy?.halo_enabled ? ' and CD supplies sent from Halo' : ''}. {signer ? 'Check each one and sign it into the register with your PIN.' : 'They don’t change any balance until signed.'}
      </p>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {empty && (
        <div className="card flex flex-col items-center py-10 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-semibold">All caught up</p>
          <p className="text-sm text-muted-foreground">Drafted entries{pharmacy?.halo_enabled ? ' and Halo dispensings' : ''} will appear here for a pharmacist to sign.</p>
        </div>
      )}
      {!!drafts?.length && (
        <section className="mb-6 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><FilePen className="h-4 w-4" /> Drafted by the team ({drafts.length})</h2>
          {drafts.map((d) => <DraftCard key={d.id} d={d} signer={signer} onDone={done} />)}
        </section>
      )}
      <div className="space-y-4">
        {items?.map((it) => <InboxCard key={it.id} it={it} onDone={done} />)}
      </div>
    </div>
  );
}

interface Draft { id: string; register_id: string; label: string; unit: string; payload: any; drafted_by_name: string | null; drafted_at: string; mine: boolean }
const TYPE_LABEL: Record<string, string> = { receipt: 'Receipt', supply: 'Supply', patient_return: 'Patient return' };

function DraftCard({ d, signer, onDone }: { d: Draft; signer: boolean; onDone: () => void }) {
  const p = d.payload;
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const who = p.entry_type === 'receipt' ? p.supplier_name : p.recipient_name;
  async function reject() {
    try { await api(`/api/entries/drafts/${d.id}/reject`, { method: 'POST', json: { reason } }); onDone(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not do that'); }
  }
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{d.label} · <span className="tabular-nums">{p.entry_type === 'receipt' ? '+' : p.entry_type === 'supply' ? '−' : ''}{p.quantity}</span> {d.unit}</p>
          <p className="text-sm text-muted-foreground">{TYPE_LABEL[p.entry_type] ?? p.entry_type} · {who ?? ''} · {String(p.transaction_date).split('-').reverse().join('/')}</p>
          <p className="text-xs text-muted-foreground">Drafted by {d.drafted_by_name ?? 'a team member'} · {new Date(d.drafted_at).toLocaleString('en-IE', { dateStyle: 'short', timeStyle: 'short' })}</p>
        </div>
        <span className="badge bg-sky-100 text-sky-900">Draft</span>
      </div>
      {signer && !open && !rejecting && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => setOpen(true)} className="btn-primary flex-1"><CheckCircle2 className="h-4 w-4" /> Check &amp; sign</button>
          <button onClick={() => setRejecting(true)} className="btn-secondary">Turn down</button>
        </div>
      )}
      {!signer && d.mine && !rejecting && <button onClick={() => { setReason(''); reject(); }} className="btn-ghost mt-2 text-sm">Withdraw my draft</button>}
      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <EntryForm registerId={d.register_id} unit={d.unit} balance={NaN} lockType submitLabel="Sign into register"
            initial={{ ...p, draft_id: d.id }} onCancel={() => setOpen(false)} onSaved={onDone} />
        </div>
      )}
      {rejecting && (
        <div className="mt-3 space-y-2">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. wrong quantity: please redo" autoFocus />
          <div className="flex gap-2">
            <button onClick={() => setRejecting(false)} className="btn-secondary flex-1">Back</button>
            <button onClick={reject} disabled={reason.trim().length < 3} className="btn-danger flex-1">Turn down</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function InboxCard({ it, onDone }: { it: Item; onDone: () => void }) {
  const p = it.payload;
  const [registerId, setRegisterId] = useState(it.register_id ?? '');
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reg = it.candidates.find((c) => c.id === registerId);

  async function reject() {
    try {
      await api(`/api/inbox/${it.id}/reject`, { method: 'POST', json: { reason } });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reject');
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{p.drug.name} {p.drug.strength} {p.drug.form ?? ''} · <span className="tabular-nums">{p.quantity}</span> {p.unit ?? reg?.unit ?? ''}</p>
          <p className="text-sm text-muted-foreground">{p.patient.name} · {p.patient.address}</p>
          <p className="text-xs text-muted-foreground">
            Dispensed {new Date(p.dispensed_at).toLocaleString('en-IE', { dateStyle: 'short', timeStyle: p.dispensed_at.length > 10 ? 'short' : undefined })}
            {p.prescriber?.name ? ` · Rx ${p.prescriber.name}` : ''}{p.pharmacist?.name ? ` · by ${p.pharmacist.name}` : ''}
          </p>
        </div>
        <span className={`badge ${it.action === 'reverse' ? 'bg-amber-100 text-amber-900' : 'bg-brand/15 text-primary'}`}>{it.action === 'reverse' ? <><Undo2 className="mr-1 h-3 w-3" /> Reversal</> : 'From Halo'}</span>
      </div>

      {it.problem && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {it.problem}</p>
      )}

      {it.action === 'reverse' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {registerId && <Link href={`/dashboard/register/${registerId}`} className="btn-primary">Open register to correct</Link>}
          <button onClick={() => setRejecting(true)} className="btn-secondary">Mark as dealt with</button>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <label className="label">Register</label>
            <select className="input" value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
              <option value="">Choose register…</option>
              {it.candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          {!open && !rejecting && (
            <div className="mt-3 flex gap-2">
              <button disabled={!registerId} onClick={() => setOpen(true)} className="btn-primary flex-1"><CheckCircle2 className="h-4 w-4" /> Check &amp; sign</button>
              <button onClick={() => setRejecting(true)} className="btn-secondary">Not a supply</button>
            </div>
          )}
          {open && registerId && (
            <div className="mt-4 border-t border-border pt-4">
              <EntryForm
                registerId={registerId}
                unit={reg?.unit ?? 'units'}
                balance={registerId === it.register_id ? Number(it.balance ?? 0) : NaN}
                lockType
                submitLabel="Sign into register"
                initial={{
                  entry_type: 'supply',
                  transaction_date: p.dispensed_at.slice(0, 10),
                  quantity: p.quantity,
                  recipient_name: p.patient.name,
                  recipient_address: p.patient.address,
                  prescriber_name: p.prescriber?.name ?? null,
                  prescriber_address: p.prescriber?.address ?? null,
                  authority_to_possess: p.prescriber?.name ? `Prescription: ${p.prescriber.name}${p.prescriber.registration ? ` (Reg ${p.prescriber.registration})` : ''}` : null,
                  prescription_ref: p.prescription_ref ?? null,
                  collected_by: p.collected_by ?? null,
                  collector_id_checked: p.collector_id_checked ?? null,
                  notes: `Halo ${p.external_id}`,
                  inbox_id: it.id,
                }}
                onCancel={() => setOpen(false)}
                onSaved={onDone}
              />
            </div>
          )}
        </>
      )}

      {rejecting && (
        <div className="mt-3 space-y-2">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. test dispense, duplicate, label reprint" />
          <div className="flex gap-2">
            <button onClick={() => setRejecting(false)} className="btn-secondary flex-1">Back</button>
            <button onClick={reject} disabled={reason.trim().length < 3} className="btn-danger flex-1">Remove from list</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
