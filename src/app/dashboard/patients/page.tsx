'use client';
import { brandOf } from '@/lib/product-name';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, UserPlus, UserRound, Download, Printer, Pencil, ArrowLeft, Loader2, Import, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PatientForm, type PatientRecord } from '@/components/dashboard/patient-form';
import { useStaff, useCan } from '@/components/dashboard/staff-context';
import { OstLabelsImport } from '@/components/dashboard/ost-labels-import';
import { can } from '@/lib/roles';

const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '-');
const TYPES: Record<string, string> = { supply: 'Supplied', patient_return: 'Patient return', patient_return_destruction: 'Return destroyed' };

/** Patients: same record layout and search as PharmacyConsultation.ie, with each patient's CD supplies. */
export default function PatientsPage() {
  const { staff } = useStaff();
  const canDo = useCan();
  const [q, setQ] = useState('');
  const [list, setList] = useState<PatientRecord[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<PatientRecord | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dupes, setDupes] = useState(false);
  const [ostOnly, setOstOnly] = useState(false);
  // Getting started links here with ?ost=labels to open the bag-label import
  const [labelsOpen] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ost') === 'labels');

  const load = useCallback(async (query: string) => {
    const d = await api(ostOnly && !query ? '/api/patients?ost=1' : `/api/patients?q=${encodeURIComponent(query)}`);
    setList(ostOnly && query ? d.patients.filter((p: any) => p.is_ost) : d.patients); setNeedsMigration(!!d.needs_migration);
  }, [ostOnly]);
  useEffect(() => { const t = setTimeout(() => load(q), 200); return () => clearTimeout(t); }, [q, load]);

  async function importFromRegister() {
    setImporting(true); setMsg(null);
    try { const d = await api('/api/patients/import', { method: 'POST' }); setMsg(d.added ? `Added ${d.added} patient${d.added === 1 ? '' : 's'} from your register.` : 'Everyone in your register already has a record.'); load(q); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not import'); }
    finally { setImporting(false); }
  }

  if (dupes) return <Duplicates canMerge={!!staff && can.record(staff.role)} onBack={() => { setDupes(false); load(q); }} />;
  if (open) return <PatientDetail patient={open} onBack={() => { setOpen(null); load(q); }} onChanged={setOpen} />;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="text-sm text-muted-foreground">Search by name, date of birth (dd/mm/yyyy) or GMS number. New patients are added automatically when you record a supply.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {staff && can.manageStaff(staff.role) && <button onClick={importFromRegister} disabled={importing} className="btn-secondary">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Import className="h-4 w-4" />} <span className="hidden sm:inline">From register</span></button>}
          {canDo('patients') && <OstLabelsImport autoOpen={labelsOpen} onDone={() => { setOstOnly(true); load(''); }} />}
          <button onClick={() => setOstOnly((v) => !v)} className={ostOnly ? "btn-primary" : "btn-secondary"} aria-pressed={ostOnly}>OST<span className="hidden sm:inline">&nbsp;patients</span></button>
          <button onClick={() => setDupes(true)} className="btn-secondary"><Users className="h-4 w-4" /> <span className="hidden sm:inline">Possible duplicates</span></button>
          <button onClick={() => setAdding(true)} className="btn-primary"><UserPlus className="h-4 w-4" /> New patient</button>
        </div>
      </div>
      {needsMigration && <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">Patient records need a one-off database update. In Supabase → SQL Editor, run <code>supabase/migrations/0008_patients.sql</code>.</p>}
      {msg && <p className="mb-4 rounded-lg bg-secondary p-3 text-sm">{msg}</p>}

      <div className="relative mb-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus className="input pl-9" placeholder="e.g. Burke, Mary O'Brien, 12/03/1950, 123456" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-2.5">Surname</th><th className="px-4 py-2.5">First name</th><th className="px-4 py-2.5">Date of birth</th><th className="px-4 py-2.5">Address</th><th className="px-4 py-2.5">{ostOnly ? 'Treatment card' : 'GMS no.'}</th><th className="px-4 py-2.5">Usual doctor</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list === null && <tr><td colSpan={6} className="px-4 py-5 text-muted-foreground">Loading…</td></tr>}
            {list?.length === 0 && <tr><td colSpan={6} className="px-4 py-5 text-muted-foreground">{q ? 'No match.' : 'No patients yet.'}</td></tr>}
            {list?.map((p) => (
              <tr key={p.id} onClick={() => setOpen(p)} className="cursor-pointer hover:bg-muted/40">
                <td className="px-4 py-2.5 font-semibold">{p.surname || '-'}</td>
                <td className="px-4 py-2.5">{p.first_name}</td>
                <td className="px-4 py-2.5 tabular-nums">{fmt(p.date_of_birth)}</td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 text-muted-foreground">{p.address || '-'}</td>
                <td className="px-4 py-2.5 tabular-nums">{ostOnly ? ((p as any).treatment_card_no || '-') : p.gms_number || '-'}{!ostOnly && (p as any).is_ost && <span className="badge ml-1 bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200">OST</span>}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.gp_name || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="New patient" wide>
        {adding && <PatientForm onSaved={(p) => { setAdding(false); setOpen(p); }} />}
      </Modal>
    </div>
  );
}

function PatientDetail({ patient, onBack, onChanged }: { patient: PatientRecord; onBack: () => void; onChanged: (p: PatientRecord) => void }) {
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<{ rows: any[]; totals: { label: string; unit: string; supplied: number; returned: number; count: number }[] } | null>(null);
  useEffect(() => { api(`/api/reports/patient?patient_id=${patient.id}`).then(setData).catch(() => setData({ rows: [], totals: [] })); }, [patient.id]);
  const name = `${patient.first_name} ${patient.surname}`.trim();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <button onClick={onBack} className="btn-ghost no-print -ml-3"><ArrowLeft className="h-4 w-4" /> All patients</button>
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <UserRound className="mt-1 h-8 w-8 text-brand" />
            <div>
              <h1 className="text-2xl font-bold">{name}</h1>
              <p className="text-sm text-muted-foreground">{[patient.date_of_birth && `Born ${fmt(patient.date_of_birth)}`, patient.gms_number && `GMS ${patient.gms_number}`, patient.phone].filter(Boolean).join(' · ') || 'No date of birth recorded'}</p>
              <p className="text-sm">{patient.address || '-'}</p>
              {patient.gp_name && <p className="mt-1 text-sm text-muted-foreground">Usual doctor: <b className="text-foreground">{patient.gp_name}</b>{patient.gp_address ? `, ${patient.gp_address}` : ''}</p>}
              {patient.notes && <p className="mt-1 text-sm text-muted-foreground">{patient.notes}</p>}
            </div>
          </div>
          <div className="no-print flex gap-2">
            <button onClick={() => setEditing(true)} className="btn-secondary text-sm"><Pencil className="h-4 w-4" /> Edit</button>
            <a href={`/api/reports/patient?patient_id=${patient.id}&format=csv`} className="btn-secondary text-sm"><Download className="h-4 w-4" /> CSV</a>
            <button onClick={() => window.print()} className="btn-secondary text-sm"><Printer className="h-4 w-4" /> Print</button>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Controlled drug supplies</p>
        {data === null ? <p className="text-sm text-muted-foreground">Loading…</p> : data.rows.length === 0 ? <p className="text-sm text-muted-foreground">None recorded yet.</p> : (
          <>
            <table className="mb-4 w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-1.5">Drug</th><th className="py-1.5 text-right">Supplies</th><th className="py-1.5 text-right">Total supplied</th></tr></thead>
              <tbody className="divide-y divide-border">{data.totals.map((t) => <tr key={t.label}><td className="py-1.5">{t.label}</td><td className="py-1.5 text-right tabular-nums">{t.count}</td><td className="py-1.5 text-right font-semibold tabular-nums">{t.supplied} {t.unit}</td></tr>)}</tbody>
            </table>
            <div className="overflow-x-auto">
              <table className="register-table min-w-[680px]">
                <thead><tr><th>Date</th><th>Drug</th><th>Type</th><th>Prescriber</th><th>Authority / Rx</th><th>Amount</th></tr></thead>
                <tbody>{data.rows.slice().reverse().map((r) => (
                  <tr key={r.id}>
                    <td className="tabular-nums">{fmt(r.transaction_date)}</td>
                    <td><Link href={`/dashboard/register/${r.register_id}`} className="text-primary hover:underline">{r.product ? `${brandOf(r.product) ?? r.product.drug_name} ${r.product.strength}` : ''}</Link></td>
                    <td>{TYPES[r.entry_type] ?? r.entry_type}</td>
                    <td>{r.prescriber_name}</td>
                    <td className="text-xs">{[r.authority_to_possess, r.prescription_ref].filter(Boolean).join(' · ')}</td>
                    <td className="text-right tabular-nums">{Number(r.quantity)} {r.product?.unit}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={`Edit ${name}`} wide>
        {editing && <PatientForm initial={patient} onSaved={(p) => { setEditing(false); onChanged(p); }} onArchived={() => { setEditing(false); onBack(); }} />}
      </Modal>
    </div>
  );
}

type DupP = { id: string; first_name: string; surname: string; date_of_birth: string | null; address: string | null; gms_number: string | null };

/** Records that look like the same person (docs/PATIENT_MATCHING.md §6.3, §9). Merging keeps one record and moves the other's register links to it. */
function Duplicates({ onBack, canMerge }: { onBack: () => void; canMerge: boolean }) {
  const [pairs, setPairs] = useState<{ a: DupP; b: DupP; level: string; reasons: string[] }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api('/api/patients/duplicates').then((d) => setPairs(d.pairs ?? [])).catch(() => setPairs([])), []);
  useEffect(() => { load(); }, [load]);
  async function merge(from: DupP, into: DupP) {
    if (!window.confirm(`Merge ${from.first_name} ${from.surname} into ${into.first_name} ${into.surname}?\n\nTheir register lines will be linked to the record you keep. Register lines themselves aren't changed. The merge is recorded in the audit trail.`)) return;
    setBusy(from.id + into.id); setMsg(null);
    try { const d = await api(`/api/patients/${from.id}/merge`, { method: 'POST', json: { into: into.id } }); setMsg(`Merged. ${d.lines_moved} register line${d.lines_moved === 1 ? '' : 's'} now linked to ${into.first_name} ${into.surname}.`); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not merge'); }
    finally { setBusy(null); }
  }
  const Side = ({ p }: { p: DupP }) => (
    <div className="min-w-0 flex-1 rounded-lg bg-muted/50 p-3">
      <p className="font-semibold">{p.first_name} {p.surname}</p>
      <p className="text-xs text-muted-foreground">{[p.date_of_birth && `DOB ${fmt(p.date_of_birth)}`, p.gms_number && `GMS ${p.gms_number}`].filter(Boolean).join(' · ') || 'No DOB or GMS'}</p>
      <p className="truncate text-xs text-muted-foreground">{p.address || 'No address'}</p>
    </div>
  );
  return (
    <div className="mx-auto max-w-4xl">
      <button onClick={onBack} className="btn-ghost mb-3"><ArrowLeft className="h-4 w-4" /> Patients</button>
      <h1 className="text-2xl font-bold">Possible duplicates</h1>
      <p className="mb-4 text-sm text-muted-foreground">Records that look like the same person, from a different spelling of the name or address. Check them, then keep one.{!canMerge && ' Only a pharmacist can merge records.'}</p>
      {msg && <p className="mb-4 rounded-lg bg-secondary p-3 text-sm">{msg}</p>}
      {pairs === null && <p className="text-muted-foreground">Looking…</p>}
      {pairs?.length === 0 && <div className="card text-center text-muted-foreground">No likely duplicates found.</div>}
      <div className="space-y-3">
        {pairs?.map(({ a, b, level, reasons }) => (
          <div key={a.id + b.id} className="card">
            <p className="mb-2 flex flex-wrap gap-1 text-xs"><span className="badge bg-brand/15 text-primary">{level === 'certain' ? 'Same person' : 'Very likely'}</span>{reasons.map((r) => <span key={r} className="rounded bg-brand/10 px-1.5 py-0.5 text-primary">✓ {r}</span>)}</p>
            <div className="flex flex-col gap-2 sm:flex-row"><Side p={a} /><Side p={b} /></div>
            {canMerge && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button disabled={!!busy} onClick={() => merge(b, a)} className="btn-secondary py-1.5 text-sm">Keep {a.first_name} {a.surname} (left)</button>
                <button disabled={!!busy} onClick={() => merge(a, b)} className="btn-secondary py-1.5 text-sm">Keep {b.first_name} {b.surname} (right)</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
