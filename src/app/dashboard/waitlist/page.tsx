'use client';

import { useEffect, useState } from 'react';
import { Download, Mail, Phone, Building2, Loader2, Copy } from 'lucide-react';
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
      <AddPharmacy />
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
                <td className="px-4 py-2.5 text-muted-foreground">{r.dispensing_system || '-'}</td>
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

/** Site owner: add a pharmacy and invite its login. They choose their own password from the email. */
function AddPharmacy() {
  const [f, setF] = useState({ email: '', pharmacy_name: '', address: '', contact_name: '', complimentary: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string | null } | null>(null);
  const set = (k: 'email' | 'pharmacy_name' | 'address' | 'contact_name') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const d = await api('/api/admin/pharmacies', { method: 'POST', json: f });
      setMsg(d.emailed
        ? { ok: true, text: `Added ${f.pharmacy_name}. An invite has gone to ${f.email}: they choose a password from the email, then set up their supervising pharmacist and PIN.` }
        : { ok: true, text: `Added ${f.pharmacy_name}, but the invite email couldn't be sent. Send ${f.email} this one-time link yourself (it expires):`, link: d.link });
      setF({ email: '', pharmacy_name: '', address: '', contact_name: '', complimentary: false });
    } catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not add the pharmacy' }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={add} className="card mb-6 space-y-3">
      <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><h2 className="font-semibold">Add a pharmacy</h2></div>
      <p className="text-sm text-muted-foreground">Creates the pharmacy and emails an invite to its login. Only you can do this.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="ap-email">Login email</label><input id="ap-email" type="email" required className="input" value={f.email} onChange={set('email')} /></div>
        <div><label className="label" htmlFor="ap-contact">Contact name (optional)</label><input id="ap-contact" className="input" value={f.contact_name} onChange={set('contact_name')} /></div>
        <div><label className="label" htmlFor="ap-name">Pharmacy name</label><input id="ap-name" required minLength={2} className="input" value={f.pharmacy_name} onChange={set('pharmacy_name')} /></div>
        <div><label className="label" htmlFor="ap-address">Address</label><input id="ap-address" required minLength={3} className="input" value={f.address} onChange={set('address')} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.complimentary} onChange={(e) => setF({ ...f, complimentary: e.target.checked })} /> Complimentary (free, never billed). Otherwise they start on the free month.</label>
      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-secondary' : 'bg-destructive/10 text-destructive'}`}>
          {msg.text}
          {msg.link && <div className="mt-2 flex gap-2"><input readOnly className="input py-1 text-xs" value={msg.link} onFocus={(e) => e.target.select()} /><button type="button" className="btn-secondary py-1" onClick={() => navigator.clipboard?.writeText(msg.link!)}><Copy className="h-4 w-4" /> Copy</button></div>}
        </div>
      )}
      <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add pharmacy &amp; send invite</button>
    </form>
  );
}
