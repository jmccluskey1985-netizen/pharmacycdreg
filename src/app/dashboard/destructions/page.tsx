'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';

// The "Controlled Drugs Witnessed Destruction Record" section of the book (FR18–FR20).
export default function DestructionsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    Promise.all([api('/api/search?type=destruction&sort=desc'), api('/api/search?type=patient_return_destruction&sort=desc')]).then(([a, b]) =>
      setRows([...a.results, ...b.results].sort((x, y) => y.transaction_date.localeCompare(x.transaction_date))),
    );
  }, []);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Witnessed Destruction Record</h1>
          <p className="text-sm text-muted-foreground">Record a destruction from the drug&apos;s register page so the balance updates.</p>
        </div>
        <button onClick={() => window.print()} className="btn-secondary no-print"><Printer className="h-4 w-4" /> Print</button>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="register-table min-w-[720px]">
          <thead><tr><th>Date</th><th>Product</th><th>Source</th><th>Amount destroyed</th><th>Witness</th><th>Capacity</th><th>Method</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={7}>Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground">No destructions recorded</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="tabular-nums">{r.transaction_date}</td>
                <td>{r.product?.drug_name} {r.product?.strength} {r.product?.form}</td>
                <td>{r.entry_type === 'destruction' ? 'Pharmacy stock' : `Patient return${r.recipient_name ? ` — ${r.recipient_name}` : ''}`}</td>
                <td className="text-right tabular-nums">{Number(r.quantity)} {r.product?.unit}</td>
                <td>{r.witness_name}</td>
                <td>{r.witness_role}</td>
                <td>{r.destruction_method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
