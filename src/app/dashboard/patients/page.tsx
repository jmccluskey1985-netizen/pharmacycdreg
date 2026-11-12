'use client';
import { brandOf } from '@/lib/product-name';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, UserPlus, UserRound, Download, Printer, Pencil, ArrowLeft, Loader2, Import } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PatientForm, type PatientRecord } from '@/components/dashboard/patient-form';
import { useStaff } from '@/components/dashboard/staff-context';
import { can } from '@/lib/roles';

const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const TYPES: Record<string, string> = { supply: 'Supplied', patient_return: 'Patient return', patient_return_destruction: 'Return destroyed' };

/** Patients: same record layout and search as PharmacyConsultation.ie, with each patient's CD supplies. */
export default function PatientsPage() {
  const { staff } = useStaff();
  const [q, setQ] = useState('');
  const [list, setList] = useState<PatientRecord[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<PatientRecord | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    const d = await api(`/api/patients?q=${encodeURIComponent(query)}`);
    setList(d.patients); setNeedsMigration(!!d.needs_migration);
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 200); return () => clearTimeout(t); }, [q, load]);

  async function importFromRegister() {
    setImporting(true); setMsg(null);
    try { const d = await api('/api/patients/import', { method: 'POST' }); setMsg(d.added ? `Added ${d.added} patient${d.added === 1 ? '' : 's'} from your register.` : 'Everyone in your register already has a record.'); load(q); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not import'); }
    finally { setImporting(false); }
  }

  if (open) return <PatientDetail patient={open} onBack={() => { setOpen(null); load(q); }} onChanged={setOpen} />;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="text-sm text-muted-foreground">Search by name, date of birth (dd/mm/yyyy) or GMS number. New patients are added automatically when you record a supply.</p>
        </div>
        <div className="flex gap-2">
          {staff && can.manageStaff(staff.role) && <button onClick={importFromRegister} disabled={importing} className="btn-secondary">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Import className="h-4 w-4" />} <span className="hidden sm:inline">From register</span></button>}
          <button onClick={() => setAdding(true)} className="btn-primary"><UserPlus className="h-4 w-4" /> New patient</button>
        </div>
      </div>
      {needsMigration && <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">Patient records need a one-off database update. In Supabase → SQL Editor, run <code>supabase/migrations/0008_patients.sql</code>.</p>}
      {msg && <p className="mb-4 rounded-lg bg-secondary p-3 text-sm">{msg}</p>}

      <div className="relative mb-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus className="input pl-9" placeholder="e.g. Burke, Mary O'Brien, 12/03/1950, 123456" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-2.5">Surname</th><th className="px-4 py-2.5">First name</th><th className="px-4 py-2.5">Date of birth</th><th className="px-4 py-2.5">Address</th><th className="px-4 py-2.5">GMS no.</th><th className="px-4 py-2.5">Usual doctor</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list === null && <tr><td colSpan={6} className="px-4 py-5 text-muted-foreground">Loading…</td></tr>}
            {list?.length === 0 && <tr><td colSpan={6} className="px-4 py-5 text-muted-foreground">{q ? 'No match.' : 'No patients yet.'}</td></tr>}
            {list?.map((p) => (
              <tr key={p.id} onClick={() => setOpen(p)} className="cursor-pointer hover:bg-muted/40">
                <td className="px-4 py-2.5 font-semibold">{p.surname || '—'}</td>
                <td className="px-4 py-2.5">{p.first_name}</td>
                <td className="px-4 py-2.5 tabular-nums">{fmt(p.date_of_birth)}</td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 text-muted-foreground">{p.address || '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{p.gms_number || '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.gp_name || '—'}</td>
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
              <p className="text-sm">{patient.address || '—'}</p>
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
