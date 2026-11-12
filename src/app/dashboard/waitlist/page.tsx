'use client';

import { useEffect, useState } from 'react';
import { Download, Mail, Phone } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Row { id: string; created_at: string; name: string; pharmacy_name: string; email: string; phone: string | null; dispensing_system: string | null; consent_contact: boolean; notes: string | null }

export default function WaitlistPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api('/api/admin/waitlist').then((d) => setRows(d.waitlist)).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load')); }, []);

  if (error) return <p className="text-muted-foreground">{error === 'Not found' ? 'Only the site owner can see the waitlist.' : error}</p>;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Waitlist</h1>
          <p className="text-sm text-muted-foreground">Pharmacies that joined from the home page. Only visible to you.</p>
        </div>
        <a href="/api/admin/waitlist?format=csv" className="btn-secondary"><Download className="h-4 w-4" /> CSV</a>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-2.5">Joined</th><th className="px-4 py-2.5">Pharmacy</th><th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Contact</th><th className="px-4 py-2.5">Dispensing system</th><th className="px-4 py-2.5">OK to contact</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows === null && <tr><td colSpan={6} className="px-4 py-5 text-muted-foreground">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={6} className="px-4 py-5 text-muted-foreground">No one yet.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{new Date(r.created_at).toLocaleDateString('en-IE')}</td>
                <td className="px-4 py-2.5 font-semibold">{r.pharmacy_name}</td>
                <td className="px-4 py-2.5">{r.name}</td>
                <td className="px-4 py-2.5">
                  <a href={`mailto:${r.email}`} className="flex items-center gap-1.5 text-primary hover:underline"><Mail className="h-3.5 w-3.5" /> {r.email}</a>
                  {r.phone && <a href={`tel:${r.phone}`} className="mt-0.5 flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {r.phone}</a>}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.dispensing_system || '—'}</td>
                <td className="px-4 py-2.5">{r.consent_contact ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows && rows.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{rows.length} on the list.</p>}
    </div>
  );
}
