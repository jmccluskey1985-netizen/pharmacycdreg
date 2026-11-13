'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface R { id?: string; label?: string; ok: boolean; checked: number; broken_seq: number | null; reason: string | null; head: string | null }

/**
 * "Verify integrity": every line's fingerprint is recomputed from its contents and the line
 * before it. Shows the fingerprint of the latest line, which can be written down or printed
 *: if anything earlier were ever altered, that fingerprint could not be reproduced.
 */
export function IntegrityCheck({ registerId, compact }: { registerId?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; registers: R[]; audit: R | null; checked_at: string; needs_migration?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null);
    try { setRes(await api(`/api/integrity${registerId ? `?register_id=${registerId}` : ''}`)); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not check'); }
    finally { setBusy(false); }
  }
  const lines = res?.registers.reduce((n, r) => n + r.checked, 0) ?? 0;
  return (
    <div className={compact ? 'space-y-2' : 'card space-y-3'}>
      {!compact && (
        <div>
          <h2 className="font-semibold">Register integrity</h2>
          <p className="text-sm text-muted-foreground">Every line is sealed with a fingerprint of its contents and the line before it. Checking recomputes them all: any change made outside the app, even directly in the database, shows up here.</p>
        </div>
      )}
      <button onClick={run} disabled={busy} className="btn-secondary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify integrity</button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {res?.needs_migration && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run migration 0013 in Supabase.</p>}
      {res && !res.needs_migration && (
        <div className={`rounded-lg p-3 text-sm ${res.ok ? 'bg-brand/10' : 'bg-destructive/10 text-destructive'}`}>
          <p className="flex items-center gap-2 font-semibold">{res.ok ? <ShieldCheck className="h-4 w-4 text-brand" /> : <ShieldAlert className="h-4 w-4" />}
            {res.ok ? `Intact: ${lines} register line${lines === 1 ? '' : 's'}${res.audit ? ` and ${res.audit.checked} audit records` : ''} verified` : 'A record has been altered outside the app'}</p>
          <ul className="mt-1 space-y-0.5">
            {res.registers.filter((r) => !r.ok).map((r) => <li key={r.id}>{r.label}: line {r.broken_seq}: {r.reason}</li>)}
            {res.audit && !res.audit.ok && <li>Audit trail: record {res.audit.broken_seq}: {res.audit.reason}</li>}
          </ul>
          {res.ok && res.registers.length === 1 && res.registers[0].head && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Latest fingerprint: {res.registers[0].head.slice(0, 16)}</p>}
          {res.ok && res.audit?.head && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Audit trail fingerprint: {res.audit.head.slice(0, 16)} · checked {new Date(res.checked_at).toLocaleString('en-IE')}</p>}
        </div>
      )}
    </div>
  );
}
