'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/modal';
import { api, ApiError } from '@/lib/api';

interface Check { id: string; counted: number; register_balance: number; notes: string | null; checked_by_name: string; checked_at: string }

/** Count the stock and record it against the register balance. Differences are recorded, never auto-fixed. */
export function StockCheckButton({ registerId, unit, balance, canRecord }: { registerId: string; unit: string; balance: number; canRecord: boolean }) {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (open) api(`/api/stock-checks?register_id=${registerId}`).then((d) => setChecks(d.checks)).catch(() => setChecks([]));
  }, [open, registerId]);

  const n = counted === '' ? null : Number(counted);
  const diff = n == null ? null : n - balance;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await api('/api/stock-checks', { method: 'POST', json: { register_id: registerId, counted: n, notes: notes || null } });
      setDone(d.diff === 0 ? `Recorded: ${n} ${unit} — matches the register.` : `Recorded with a difference of ${d.diff > 0 ? '+' : ''}${d.diff} ${unit}. Investigate and record any correction in the register.`);
      setCounted(''); setNotes('');
      setChecks(null);
      api(`/api/stock-checks?register_id=${registerId}`).then((x) => setChecks(x.checks));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the check');
    } finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setDone(null); }} className="btn-secondary"><ClipboardCheck className="h-4 w-4" /> Stock check</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Stock check">
        <div className="space-y-4">
          {canRecord && (
            <form onSubmit={save} className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3 text-sm"><span>Register balance</span><b className="text-lg tabular-nums">{balance} {unit}</b></div>
              <div><label className="label">Counted on the shelf ({unit})</label><input className="input text-lg font-semibold" type="number" min="0" step="any" inputMode="decimal" required value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus /></div>
              {diff !== null && diff !== 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {diff > 0 ? `${diff} more` : `${-diff} fewer`} than the register. Recount, then note what you found.</p>
              )}
              {diff === 0 && <p className="flex items-center gap-2 text-sm text-brand"><CheckCircle2 className="h-4 w-4" /> Matches the register</p>}
              <div><label className="label">Notes {diff ? '(required)' : '(optional)'}</label><input className="input" required={!!diff} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={diff ? 'e.g. Recounted twice; checking last week’s supplies' : ''} /></div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {done && <p className="rounded-lg bg-brand/10 p-3 text-sm">{done}</p>}
              <button className="btn-primary w-full" disabled={busy || n == null}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign & record check</button>
            </form>
          )}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Previous checks</p>
            {checks === null ? <p className="text-sm text-muted-foreground">Loading…</p> : checks.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {checks.map((c) => {
                  const d = Number(c.counted) - Number(c.register_balance);
                  return (
                    <li key={c.id} className="px-3 py-2">
                      <span className="flex justify-between gap-2"><span>{new Date(c.checked_at).toLocaleString('en-IE', { dateStyle: 'short', timeStyle: 'short' })} · {c.checked_by_name}</span><b className={d === 0 ? 'text-brand' : 'text-amber-700'}>{d === 0 ? 'Correct' : `${d > 0 ? '+' : ''}${d}`}</b></span>
                      <span className="block text-xs text-muted-foreground">Counted {c.counted}, register {c.register_balance}{c.notes ? ` — ${c.notes}` : ''}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
