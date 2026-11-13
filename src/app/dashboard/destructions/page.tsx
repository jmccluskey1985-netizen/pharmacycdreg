'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, ShieldCheck, BookX, Loader2, Plus, Flame } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/modal';
import { useStaff } from '@/components/dashboard/staff-context';
import { can } from '@/lib/roles';
import { canWrite } from '@/lib/stripe';
import { brandOf } from '@/lib/product-name';
import { QuickFillInput } from '@/components/dashboard/quickfill-input';
import type { QItem } from '@/components/dashboard/quarantine';

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '-');
const REASONS: Record<string, string> = { expired: 'Expired', damaged: 'Damaged', recalled: 'Recalled', other: 'Other' };

/**
 * Two separate records, as in the paper system:
 *  1. Witnessed Destruction Record: the section at the back of the CD register: Schedule 2
 *     PHARMACY STOCK (expired / damaged), destroyed in front of an authorised person. Reduces
 *     the drug's register balance. Stock waits here, set aside, until the witness attends.
 *  2. CD Destruction Record Book: a separate book: PATIENT-RETURNED CDs (Sch 2–4) and expired
 *     Schedule 3/4 stock. Never part of a register balance; no authorised witness needed.
 */
export default function DestructionsPage() {
  const [tab, setTab] = useState<'witnessed' | 'book'>('witnessed');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'book') setTab('book');
  }, []);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Destructions</h1>
          <p className="text-sm text-muted-foreground">Schedule 2 stock and patient returns are kept in separate records, as in the paper system.</p>
        </div>
        <button onClick={() => window.print()} className="btn-secondary no-print"><Printer className="h-4 w-4" /> Print</button>
      </div>
      <div className="no-print mb-5 grid max-w-2xl grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        <button onClick={() => setTab('witnessed')} className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-sm font-semibold ${tab === 'witnessed' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}><ShieldCheck className="h-4 w-4 flex-shrink-0" /> Witnessed: Sch 2 stock</button>
        <button onClick={() => setTab('book')} className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-sm font-semibold ${tab === 'book' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}><BookX className="h-4 w-4 flex-shrink-0" /> Destruction Record Book</button>
      </div>
      {tab === 'witnessed' ? <Witnessed /> : <DestructionBook />}
    </div>
  );
}

/* ───────────── 1. Witnessed Destruction Record (CD register) ───────────── */
function Witnessed() {
  const { staff, pharmacy } = useStaff();
  const mayRecord = !!staff && can.record(staff.role) && canWrite(pharmacy?.subscription_status);
  const [items, setItems] = useState<QItem[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [history, setHistory] = useState<any[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const load = useCallback(() => {
    api('/api/quarantine').then((d) => { setItems(d.items); setNeedsMigration(!!d.needs_migration); }).catch(() => setItems([]));
    api('/api/search?type=destruction&sort=desc').then((d) => setHistory(d.results)).catch(() => setHistory([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const awaiting = (items ?? []).filter((i) => i.status === 'awaiting');

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Awaiting destruction</h2>
            <p className="text-sm text-muted-foreground">Expired or damaged Schedule 2 stock set aside in the CD safe. Still in each register’s balance until destroyed in front of an authorised person (Garda, PSI authorised officer). Set stock aside from the drug’s register page.</p>
          </div>
          {mayRecord && awaiting.length > 0 && <button onClick={() => setRecording(true)} disabled={!picked.length} className="btn-primary"><Flame className="h-4 w-4" /> Record witnessed destruction{picked.length ? ` (${picked.length})` : ''}</button>}
        </div>
        {needsMigration && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run migration 0011 in Supabase.</p>}
        {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : awaiting.length === 0 ? <p className="text-sm text-muted-foreground">Nothing awaiting destruction.</p> : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {awaiting.map((i) => (
              <label key={i.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/40">
                {mayRecord && <input type="checkbox" className="h-5 w-5 accent-[#54BD50]" checked={picked.includes(i.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))} />}
                <span className="flex-1"><b>{i.label}</b>, {Number(i.quantity)} {i.unit} · {REASONS[i.reason] ?? i.reason}{i.batch ? ` · batch ${i.batch}` : ''}{i.expiry_date ? ` · exp ${fmt(i.expiry_date)}` : ''}</span>
                <span className="text-xs text-muted-foreground">set aside {fmt(i.created_at)}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Witnessed Destruction Record</h2>
        <div className="card overflow-x-auto p-0">
          <table className="register-table min-w-[760px]">
            <thead><tr><th>Date</th><th>Product</th><th>Amount destroyed</th><th>Authorised witness</th><th>Capacity</th><th>Method</th><th>Details</th></tr></thead>
            <tbody>
              {history === null && <tr><td colSpan={7}>Loading…</td></tr>}
              {history?.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground">No destructions recorded</td></tr>}
              {history?.map((r) => (
                <tr key={r.id}>
                  <td className="tabular-nums">{fmt(r.transaction_date)}</td>
                  <td><Link href={`/dashboard/register/${r.register_id}`} className="text-primary hover:underline">{r.product ? `${brandOf(r.product) ?? r.product.drug_name} ${r.product.strength}` : ''}</Link></td>
                  <td className="text-right font-semibold tabular-nums">{Number(r.quantity)} {r.product?.unit}</td>
                  <td>{r.witness_name}</td><td>{r.witness_role}</td><td>{r.destruction_method ?? '-'}</td>
                  <td className="text-xs text-muted-foreground">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={recording} onClose={() => setRecording(false)} title="Record witnessed destruction">
        {recording && <WitnessForm ids={picked} items={awaiting.filter((i) => picked.includes(i.id))} onDone={() => { setRecording(false); setPicked([]); load(); }} />}
      </Modal>
    </div>
  );
}

function WitnessForm({ ids, items, onDone }: { ids: string[]; items: QItem[]; onDone: () => void }) {
  const [f, setF] = useState({ transaction_date: today(), witness_name: '', witness_role: '', destruction_method: 'Denaturing kit' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api('/api/quarantine/destroy', { method: 'POST', json: { ids, ...f } }); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not record'); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <ul className="rounded-lg bg-secondary p-3 text-sm">{items.map((i) => <li key={i.id}><b>{i.label}</b>, {Number(i.quantity)} {i.unit}</li>)}</ul>
      <p className="text-sm text-muted-foreground">Schedule 2 stock must be destroyed in the presence of an <b>authorised person</b>: a member of Garda personnel, a PSI inspector / authorised officer, or another person authorised under the Misuse of Drugs Regulations. One destruction line is written to each drug’s register.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Authorised witness</label><QuickFillInput kind="witness" required value={f.witness_name} onChange={(v) => setF({ ...f, witness_name: v })} onPick={(p) => setF({ ...f, witness_name: p.name, witness_role: p.role ?? f.witness_role })} /></div>
        <div><label className="label">Capacity</label><input className="input" required value={f.witness_role} onChange={set('witness_role')} placeholder="e.g. Authorised officer (PSI), Garda" /></div>
        <div><label className="label">Date destroyed</label><input className="input" type="date" required max={today()} value={f.transaction_date} onChange={set('transaction_date')} /></div>
        <div><label className="label">Method</label><input className="input" value={f.destruction_method} onChange={set('destruction_method')} /></div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign &amp; record destruction</button>
    </form>
  );
}

/* ───────────── 2. CD Destruction Record Book (separate book) ───────────── */
interface BookRow {
  id: string; kind: 'patient_return' | 'stock_sch34'; drug: string; schedule: number | null; quantity: number; unit: string; batch: string | null; expiry_date: string | null;
  returned_by_name: string | null; returned_by_address: string | null; received_date: string; received_by_name: string; notes: string | null;
  destroyed_date: string | null; destroyed_by_name: string | null; witness_name: string | null; witness_role: string | null; destruction_method: string | null;
}

function DestructionBook() {
  const { staff, pharmacy } = useStaff();
  const mayRecord = !!staff && can.record(staff.role) && canWrite(pharmacy?.subscription_status);
  const [rows, setRows] = useState<BookRow[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [adding, setAdding] = useState<'patient_return' | 'stock_sch34' | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [destroying, setDestroying] = useState(false);
  const load = useCallback(() => api('/api/destruction-book').then((d) => { setRows(d.rows); setNeedsMigration(!!d.needs_migration); }).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new') === 'return') setAdding('patient_return'); }, []);
  const waiting = (rows ?? []).filter((r) => !r.destroyed_date);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground"><b className="text-foreground">Patient-returned CDs</b> (Schedules 2, 3 and 4) and <b className="text-foreground">expired Schedule 3/4 stock</b>. Kept apart from the CD register: returns were never pharmacy stock. No authorised witness is needed; a second pharmacist or staff member witnessing is good practice.</p>
        {mayRecord && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAdding('patient_return')} className="btn-primary"><Plus className="h-4 w-4" /> Patient return</button>
            <button onClick={() => setAdding('stock_sch34')} className="btn-secondary"><Plus className="h-4 w-4" /> Expired Sch 3/4 stock</button>
          </div>
        )}
      </div>
      {needsMigration && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run migration 0011 in Supabase.</p>}
      {mayRecord && waiting.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <span><b>{waiting.length}</b> waiting to be destroyed: tick them below, then record the destruction.</span>
          <button onClick={() => setDestroying(true)} disabled={!picked.length} className="btn-primary py-1.5"><Flame className="h-4 w-4" /> Record destruction{picked.length ? ` (${picked.length})` : ''}</button>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="register-table min-w-[980px]">
          <thead><tr>{mayRecord && <th className="no-print w-8" />}<th>Received</th><th>Type</th><th>Drug</th><th>Amount</th><th>Returned by</th><th>Received by</th><th>Destroyed</th><th>Destroyed by</th><th>Witness</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={10}>Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground">Nothing recorded yet</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} className={r.destroyed_date ? '' : 'bg-amber-50/60 dark:bg-amber-950/20'}>
                {mayRecord && <td className="no-print text-center">{!r.destroyed_date && <input type="checkbox" className="h-4 w-4 accent-[#54BD50]" checked={picked.includes(r.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))} aria-label={`Select ${r.drug}`} />}</td>}
                <td className="tabular-nums">{fmt(r.received_date)}</td>
                <td className="text-xs">{r.kind === 'patient_return' ? 'Patient return' : `Expired stock${r.schedule ? ` (Sch ${r.schedule})` : ''}`}</td>
                <td><span className="font-medium">{r.drug}</span>{(r.batch || r.expiry_date) && <span className="block text-xs opacity-75">{[r.batch && `batch ${r.batch}`, r.expiry_date && `exp ${fmt(r.expiry_date)}`].filter(Boolean).join(' · ')}</span>}</td>
                <td className="text-right font-semibold tabular-nums">{Number(r.quantity)} {r.unit}</td>
                <td>{r.returned_by_name ?? '-'}{r.returned_by_address && <span className="block text-xs opacity-75">{r.returned_by_address}</span>}</td>
                <td className="text-xs">{r.received_by_name}</td>
                <td className="tabular-nums">{r.destroyed_date ? fmt(r.destroyed_date) : <span className="text-xs font-semibold text-amber-700">awaiting</span>}</td>
                <td className="text-xs">{r.destroyed_by_name ?? ''}{r.destruction_method && <span className="block opacity-75">{r.destruction_method}</span>}</td>
                <td className="text-xs">{r.witness_name ?? ''}{r.witness_role && <span className="block opacity-75">{r.witness_role}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!adding} onClose={() => setAdding(null)} title={adding === 'patient_return' ? 'Patient-returned CD received' : 'Expired Schedule 3/4 stock'}>
        {adding && <BookForm kind={adding} onDone={() => { setAdding(null); load(); }} />}
      </Modal>
      <Modal open={destroying} onClose={() => setDestroying(false)} title="Record destruction">
        {destroying && <BookDestroyForm ids={picked} rows={waiting.filter((r) => picked.includes(r.id))} onDone={() => { setDestroying(false); setPicked([]); load(); }} />}
      </Modal>
    </div>
  );
}

function BookForm({ kind, onDone }: { kind: 'patient_return' | 'stock_sch34'; onDone: () => void }) {
  const [f, setF] = useState({ drug: '', schedule: kind === 'patient_return' ? '2' : '4', quantity: '', unit: 'tablets', batch: '', expiry_date: '', returned_by_name: '', returned_by_address: '', received_date: today(), notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/api/destruction-book', { method: 'POST', json: { kind, ...f, schedule: Number(f.schedule), quantity: Number(f.quantity), batch: f.batch || null, expiry_date: f.expiry_date || null, returned_by_name: f.returned_by_name || null, returned_by_address: f.returned_by_address || null, notes: f.notes || null } });
      onDone();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      {kind === 'patient_return' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Returned by</label><QuickFillInput kind="patient" required value={f.returned_by_name} onChange={(v) => setF({ ...f, returned_by_name: v })} onPick={(p) => setF({ ...f, returned_by_name: p.name, returned_by_address: p.address ?? f.returned_by_address })} placeholder="Patient or representative" /></div>
          <div><label className="label">Address</label><input className="input" value={f.returned_by_address} onChange={set('returned_by_address')} /></div>
        </div>
      )}
      <div><label className="label">Drug, strength and form</label><input className="input" required value={f.drug} onChange={(e) => { const v = e.target.value; const u = /caps/i.test(v) ? 'capsules' : /tab/i.test(v) ? 'tablets' : /patch/i.test(v) ? 'patches' : /amp|inj/i.test(v) ? 'ampoules' : /ml|solution|liquid|syrup/i.test(v) ? 'ml' : f.unit; setF({ ...f, drug: v, unit: u }); }} placeholder={kind === 'patient_return' ? 'e.g. OxyNorm 5mg capsules' : 'e.g. Diazepam 5mg tablets'} /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">Amount</label><input className="input font-semibold" type="number" min="0.001" step="any" inputMode="decimal" required value={f.quantity} onChange={set('quantity')} /></div>
        <div><label className="label">Counted in</label><select className="input" value={f.unit} onChange={set('unit')}>{['tablets', 'capsules', 'ml', 'patches', 'ampoules', 'vials', 'units'].map((u) => <option key={u}>{u}</option>)}</select></div>
        <div><label className="label">Schedule</label><select className="input" value={f.schedule} onChange={set('schedule')}>{(kind === 'patient_return' ? ['2', '3', '4'] : ['3', '4']).map((x) => <option key={x} value={x}>Schedule {x}</option>)}</select></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">{kind === 'patient_return' ? 'Date received' : 'Date set aside'}</label><input className="input" type="date" required max={today()} value={f.received_date} onChange={set('received_date')} /></div>
        <div><label className="label">Batch</label><input className="input" value={f.batch} onChange={set('batch')} /></div>
        <div><label className="label">Expiry</label><input className="input" type="date" value={f.expiry_date} onChange={set('expiry_date')} /></div>
      </div>
      <div><label className="label">Notes <span className="font-normal text-muted-foreground">(optional)</span></label><input className="input" value={f.notes} onChange={set('notes')} /></div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign &amp; record</button>
    </form>
  );
}

function BookDestroyForm({ ids, rows, onDone }: { ids: string[]; rows: BookRow[]; onDone: () => void }) {
  const [f, setF] = useState({ destroyed_date: today(), witness_name: '', witness_role: '', destruction_method: 'Denaturing kit' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api('/api/destruction-book/destroy', { method: 'POST', json: { ids, ...f } }); onDone(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not record'); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <ul className="rounded-lg bg-secondary p-3 text-sm">{rows.map((r) => <li key={r.id}><b>{r.drug}</b>, {Number(r.quantity)} {r.unit}{r.returned_by_name ? ` (returned by ${r.returned_by_name})` : ''}</li>)}</ul>
      <p className="text-sm text-muted-foreground">Destroyed by you (signed in). A second pharmacist or staff member as witness is good practice.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Date destroyed</label><input className="input" type="date" required max={today()} value={f.destroyed_date} onChange={set('destroyed_date')} /></div>
        <div><label className="label">Method</label><input className="input" value={f.destruction_method} onChange={set('destruction_method')} /></div>
        <div><label className="label">Witness <span className="font-normal text-muted-foreground">(recommended)</span></label><QuickFillInput kind="witness" value={f.witness_name} onChange={(v) => setF({ ...f, witness_name: v })} onPick={(p) => setF({ ...f, witness_name: p.name, witness_role: p.role ?? f.witness_role })} /></div>
        <div><label className="label">Witness capacity</label><input className="input" value={f.witness_role} onChange={set('witness_role')} placeholder="e.g. Pharmacist, Pharmacy technician" /></div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign &amp; record destruction</button>
    </form>
  );
}
