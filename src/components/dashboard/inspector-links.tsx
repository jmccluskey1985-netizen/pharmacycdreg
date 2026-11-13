'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Copy, Loader2, Ban } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStaff } from './staff-context';
import { can } from '@/lib/roles';

interface L { id: string; label: string; expires_at: string; revoked_at: string | null; created_by_name: string; created_at: string; last_used_at: string | null; use_count: number }
const fmt = (d: string) => new Date(d).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' });

/** Supervising pharmacist: give a PSI inspector / authorised officer a time-limited, read-only link. */
export function InspectorLinks() {
  const { staff } = useStaff();
  const [links, setLinks] = useState<L[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState(24);
  const [made, setMade] = useState<{ url: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api('/api/inspector-links').then((d) => { setLinks(d.links); setNeeds(!!d.needs_migration); }).catch(() => setLinks([])), []);
  useEffect(() => { if (staff && can.manageStaff(staff.role)) load(); }, [staff, load]);
  if (!staff || !can.manageStaff(staff.role)) return null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setMade(null);
    try { setMade(await api('/api/inspector-links', { method: 'POST', json: { label, hours } })); setLabel(''); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the link'); }
    finally { setBusy(false); }
  }
  const live = (links ?? []).filter((l) => !l.revoked_at && new Date(l.expires_at) > new Date());
  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">Inspector access</h2>
        <p className="text-sm text-muted-foreground">A read-only link for a PSI inspector or authorised officer: every register, destruction records and the audit trail, printable. It expires on its own and you can revoke it any time.</p>
      </div>
      {needs && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run migration 0013 in Supabase.</p>}
      <form onSubmit={create} className="flex flex-wrap gap-2">
        <input className="input min-w-[180px] flex-1" required minLength={2} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For, e.g. PSI inspection 14 Nov" />
        <select className="input w-auto" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={4}>4 hours</option><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option>
        </select>
        <button className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create link</button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {made && (
        <div className="space-y-1 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm">
          <p className="font-semibold">Copy this link now — it won’t be shown again.</p>
          <div className="flex gap-2"><input readOnly className="input flex-1 font-mono text-xs" value={made.url} onFocus={(e) => e.target.select()} /><button type="button" onClick={() => navigator.clipboard?.writeText(made.url)} className="btn-secondary px-3" aria-label="Copy link"><Copy className="h-4 w-4" /></button></div>
          <p className="text-xs text-muted-foreground">Works until {fmt(made.expires_at)}. Anyone with the link can view the registers, so give it only to the inspector.</p>
        </div>
      )}
      {live.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {live.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span><b>{l.label}</b> <span className="text-xs text-muted-foreground">· until {fmt(l.expires_at)} · opened {l.use_count}×</span></span>
              <button onClick={async () => { if (confirm(`Revoke “${l.label}”?`)) { await api(`/api/inspector-links/${l.id}`, { method: 'DELETE' }).catch(() => {}); load(); } }} className="btn-ghost py-1 text-xs"><Ban className="h-3.5 w-3.5" /> Revoke</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
