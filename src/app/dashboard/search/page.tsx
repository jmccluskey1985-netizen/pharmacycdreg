'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Printer } from 'lucide-react';
import { api } from '@/lib/api';

const TYPES: Record<string, string> = { receipt: 'Obtained', supply: 'Supplied', destruction: 'Destroyed', patient_return: 'Patient return', patient_return_destruction: 'Return destroyed' };

// NFR12–NFR14 / scenario "Search Functionality": product, date, supplier, recipient, prescriber/authority.
export default function SearchPage() {
  const [f, setF] = useState({ q: '', from: '', to: '', type: '', sort: 'desc' });
  const [results, setResults] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    const d = await api(`/api/search?${qs}`).finally(() => setBusy(false));
    setResults(d.results);
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Search the register</h1>
      <form onSubmit={run} className="card no-print mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <div className="sm:col-span-2 lg:col-span-1"><label className="label">Drug, supplier, patient, prescriber…</label><input className="input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="e.g. oxycodone, United Drug, Murphy" /></div>
        <div><label className="label">From</label><input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        <div><label className="label">Type</label><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Sort</label><select className="input" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></div>
        <button className="btn-primary self-end" disabled={busy}><Search className="h-4 w-4" /> Search</button>
      </form>

      {results && (
        <div className="card overflow-x-auto p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">{results.length} result{results.length === 1 ? '' : 's'}</p>
            <button onClick={() => window.print()} className="btn-ghost no-print text-sm"><Printer className="h-4 w-4" /> Print</button>
          </div>
          <table className="register-table min-w-[760px]">
            <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Name &amp; address</th><th>Authority</th><th>Amount</th><th>Balance</th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td className="tabular-nums">{r.transaction_date}</td>
                  <td><Link href={`/dashboard/register/${r.register_id}`} className="text-primary underline-offset-2 hover:underline">{r.product?.drug_name} {r.product?.strength}</Link></td>
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
      )}
    </div>
  );
}
