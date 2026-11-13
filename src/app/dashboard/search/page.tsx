'use client';
import { productTitle, brandOf, genericLine } from '@/lib/product-name';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Printer, Pill, User, Download, BookOpen, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { searchCdProducts } from '@/data/cd-products';
import { genericKey } from '@/lib/cd-catalogue';
import { QuickFillInput } from '@/components/dashboard/quickfill-input';

const TYPES: Record<string, string> = { receipt: 'Obtained', supply: 'Supplied', destruction: 'Destroyed', patient_return: 'Patient return', patient_return_destruction: 'Return destroyed' };
interface Reg { id: string; balance: number; product: { drug_name: string; strength: string; form: string; unit: string; class_name: string; brand?: string | null } }

const sameForm = (a: string, b: string) => a.toLowerCase().replace(/s$/, '') === b.toLowerCase().replace(/s$/, '');

/** Registers matching what's typed: by brand (OxyContin → oxycodone PR), generic, class, strength or form. */
function matchRegisters(regs: Reg[], q: string): Reg[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const products = searchCdProducts(t);
  const viaBrand = (r: Reg) => products.some((p) => p.brands.some((b) => b.toLowerCase().includes(t.split(' ')[0])) && genericKey(p.generic) === genericKey(r.product.drug_name) && sameForm(p.form, r.product.form));
  const viaText = (r: Reg) => t.split(/\s+/).every((w) => `${productTitle(r.product)} ${r.product.drug_name} ${r.product.class_name}`.toLowerCase().includes(w));
  return regs.filter((r) => viaBrand(r) || viaText(r)).sort((a, b) => a.product.drug_name.localeCompare(b.product.drug_name) || a.product.form.localeCompare(b.product.form) || parseFloat(a.product.strength) - parseFloat(b.product.strength));
}

export default function SearchPage() {
  const [mode, setMode] = useState<'drug' | 'patient'>('drug');
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Search &amp; reports</h1>
      <div className="no-print mb-4 grid max-w-md grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        <button onClick={() => setMode('drug')} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold ${mode === 'drug' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}><Pill className="h-4 w-4" /> By drug</button>
        <button onClick={() => setMode('patient')} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold ${mode === 'patient' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}><User className="h-4 w-4" /> By patient</button>
      </div>
      {mode === 'drug' ? <DrugSearch /> : <PatientReport />}
    </div>
  );
}

function DrugSearch() {
  const [regs, setRegs] = useState<Reg[]>([]);
  const [f, setF] = useState({ q: '', from: '', to: '', type: '', sort: 'desc' });
  const [picked, setPicked] = useState<{ label: string; ids: string[] } | null>(null);
  const [openList, setOpenList] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { api('/api/registers').then((d) => setRegs(d.registers)).catch(() => {}); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpenList(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const matches = useMemo(() => matchRegisters(regs, f.q), [regs, f.q]);

  async function run(override?: { ids?: string[] }) {
    setBusy(true);
    const ids = override?.ids ?? picked?.ids;
    const params: Record<string, string> = { from: f.from, to: f.to, type: f.type, sort: f.sort };
    if (ids?.length) params.register_ids = ids.join(','); else if (f.q) params.q = f.q;
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    try { const d = await api(`/api/search?${qs}`); setResults(d.results); } finally { setBusy(false); }
  }
  const pick = (label: string, ids: string[]) => { setPicked({ label, ids }); setOpenList(false); run({ ids }); };

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); setOpenList(false); run(); }} className="card no-print mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <div ref={box} className="relative sm:col-span-2 lg:col-span-1">
          <label className="label">Drug (brand or generic), supplier, prescriber…</label>
          {picked ? (
            <div className="input flex items-center justify-between gap-2"><span className="truncate font-medium">{picked.label}</span><button type="button" onClick={() => { setPicked(null); setResults(null); }} aria-label="Clear"><X className="h-4 w-4 text-muted-foreground" /></button></div>
          ) : (
            <input className="input" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setOpenList(true); }} onFocus={() => setOpenList(true)} placeholder="e.g. OxyContin, MST, United Drug" autoComplete="off" />
          )}
          {!picked && openList && matches.length > 0 && (
            <ul className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-xl sm:w-[28rem]">
              {matches.length > 1 && (
                <li><button type="button" onClick={() => pick(`${f.q.trim()}: all ${matches.length}`, matches.map((m) => m.id))} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold hover:bg-secondary"><Pill className="h-4 w-4 text-brand" /> All {matches.length} matching registers</button></li>
              )}
              {matches.map((r) => (
                <li key={r.id} className="flex items-center hover:bg-secondary">
                  <button type="button" onClick={() => pick(productTitle(r.product), [r.id])} className="flex flex-1 items-center justify-between gap-3 px-3 py-2 text-left text-sm">
                    <span><b>{brandOf(r.product) ?? r.product.drug_name} {r.product.strength}</b> <span className="text-muted-foreground">· {r.product.form}</span></span>
                    <span className="text-xs tabular-nums text-muted-foreground">{r.balance} {r.product.unit}</span>
                  </button>
                  <Link href={`/dashboard/register/${r.id}`} className="px-3 py-2 text-muted-foreground hover:text-foreground" title="Open register"><BookOpen className="h-4 w-4" /></Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div><label className="label">From</label><input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        <div><label className="label">Type</label><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Sort</label><select className="input" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></div>
        <button className="btn-primary self-end" disabled={busy}><Search className="h-4 w-4" /> Search</button>
      </form>
      {results && <ResultsTable results={results} title={picked?.label} />}
    </>
  );
}

function ResultsTable({ results, title }: { results: any[]; title?: string }) {
  return (
    <div className="card overflow-x-auto p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">{title ? `${title} · ` : ''}{results.length} result{results.length === 1 ? '' : 's'}</p>
        <button onClick={() => window.print()} className="btn-ghost no-print text-sm"><Printer className="h-4 w-4" /> Print</button>
      </div>
      <table className="register-table min-w-[760px]">
        <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Name &amp; address</th><th>Authority</th><th>Amount</th><th>Balance</th></tr></thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id}>
              <td className="tabular-nums">{r.transaction_date}</td>
              <td><Link href={`/dashboard/register/${r.register_id}`} className="text-primary underline-offset-2 hover:underline">{r.product ? `${brandOf(r.product) ?? r.product.drug_name} ${r.product.strength}` : ''}</Link></td>
              <td>{TYPES[r.entry_type]}{r.correction_count > 0 && <span className="badge ml-1 bg-amber-100 text-amber-900">corrected</span>}</td>
              <td>{r.entry_type === 'receipt' ? r.supplier_name : r.recipient_name ?? (r.witness_name ? `Witness: ${r.witness_name}` : '')}</td>
              <td className="text-xs">{[r.authority_to_possess, r.prescriber_name, r.prescription_ref].filter(Boolean).join(' · ')}</td>
              <td className="text-right tabular-nums">{Number(r.quantity)}</td>
              <td className="text-right font-semibold tabular-nums">{Number(r.running_balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PatientReport() {
  const [name, setName] = useState('');
  const [patient, setPatient] = useState<{ name: string; address: string | null; patient_id?: string } | null>(null);
  const [dates, setDates] = useState({ from: '', to: '' });
  const [data, setData] = useState<{ rows: any[]; totals: { label: string; unit: string; supplied: number; returned: number; count: number }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = (extra: Record<string, string> = {}) => {
    const p = patient ?? { name, address: null };
    const who = p.patient_id ? { patient_id: p.patient_id } : { name: p.name, address: p.address ?? '' };
    return new URLSearchParams(Object.entries({ ...who, ...dates, ...extra }).filter(([, v]) => v) as [string, string][]).toString();
  };
  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try { setData(await api(`/api/reports/patient?${qs()}`)); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not run the report'); }
    finally { setBusy(false); }
  }

  const who = patient ?? (name ? { name, address: null } : null);
  return (
    <>
      <form onSubmit={run} className="card no-print mb-5 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <div>
          <label className="label">Patient</label>
          <QuickFillInput kind="patient" required value={name} onChange={(v) => { setName(v); setPatient(null); }} onPick={(s) => { setName(s.name); setPatient({ name: s.name, address: s.address, patient_id: s.patient_id }); }} placeholder="Start typing a name" />
          {patient?.address && <p className="mt-1 text-xs text-muted-foreground">{patient.address}</p>}
        </div>
        <div><label className="label">From</label><input type="date" className="input" value={dates.from} onChange={(e) => setDates({ ...dates, from: e.target.value })} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={dates.to} onChange={(e) => setDates({ ...dates, to: e.target.value })} /></div>
        <button className="btn-primary self-end" disabled={busy || name.trim().length < 2}><Search className="h-4 w-4" /> Run report</button>
      </form>
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {data && who && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Controlled drug supplies: patient report</p>
                <p className="text-lg font-bold">{who.name}</p>
                {who.address && <p className="text-sm text-muted-foreground">{who.address}</p>}
                <p className="text-xs text-muted-foreground">{dates.from || dates.to ? `${dates.from || 'start'} to ${dates.to || 'today'}` : 'All dates'} · printed {new Date().toLocaleDateString('en-IE')}</p>
              </div>
              <div className="no-print flex gap-2">
                <a href={`/api/reports/patient?${qs({ format: 'csv' })}`} className="btn-secondary text-sm"><Download className="h-4 w-4" /> CSV</a>
                <button onClick={() => window.print()} className="btn-secondary text-sm"><Printer className="h-4 w-4" /> Print</button>
              </div>
            </div>
            {data.totals.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-1.5">Drug</th><th className="py-1.5 text-right">Supplies</th><th className="py-1.5 text-right">Total supplied</th><th className="py-1.5 text-right">Returned</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {data.totals.map((t) => (
                    <tr key={t.label}><td className="py-1.5">{t.label}</td><td className="py-1.5 text-right tabular-nums">{t.count}</td><td className="py-1.5 text-right font-semibold tabular-nums">{t.supplied} {t.unit}</td><td className="py-1.5 text-right tabular-nums">{t.returned || '-'}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {data.rows.length === 0 ? <p className="text-sm text-muted-foreground">No controlled drug supplies recorded for this patient.</p> : (
            <div className="card overflow-x-auto p-0">
              <table className="register-table min-w-[720px]">
                <thead><tr><th>Date</th><th>Drug</th><th>Type</th><th>Prescriber</th><th>Authority / Rx</th><th>Collected by</th><th>Amount</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="tabular-nums">{r.transaction_date}</td>
                      <td><Link href={`/dashboard/register/${r.register_id}`} className="text-primary underline-offset-2 hover:underline">{r.product ? `${brandOf(r.product) ?? r.product.drug_name} ${r.product.strength}` : ''}</Link> <span className="text-xs text-muted-foreground">{r.product?.form}</span></td>
                      <td>{TYPES[r.entry_type]}{r.correction_count > 0 && <span className="badge ml-1 bg-amber-100 text-amber-900">corrected</span>}</td>
                      <td>{r.prescriber_name}</td>
                      <td className="text-xs">{[r.authority_to_possess, r.prescription_ref].filter(Boolean).join(' · ')}</td>
                      <td className="text-xs">{r.collected_by}</td>
                      <td className="text-right tabular-nums">{Number(r.quantity)} {r.product?.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="no-print text-xs text-muted-foreground">Running this report is recorded in the audit trail.</p>
        </div>
      )}
    </>
  );
}
