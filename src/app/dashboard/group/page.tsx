'use client';
import { useEffect, useState } from 'react';
import { Building2, BellRing, Flame, ClipboardCheck, Clock, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

interface Row {
  id: string; name: string; address: string | null; current: boolean; status: string | null;
  registers: number; entries_7d: number; late_30d: number; reminders_due: number; awaiting_destruction: number;
  stock_checks_overdue: number; stock_check_frequency: string; last_stock_check: string | null; discrepancies: number;
}

const STATUS: Record<string, string> = { trialing: 'Free month', active: 'Subscribed', complimentary: 'Complimentary', past_due: 'Payment due', trial_ended: 'Free month ended', canceled: 'Cancelled' };

/** Superintendent: every pharmacy at a glance. Counts and dates only; open a pharmacy to see its registers. */
export default function GroupPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => { api('/api/group').then((d) => setRows(d.pharmacies)).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load')); }, []);

  async function open(id: string, current: boolean) {
    if (current) { window.location.assign('/dashboard'); return; }
    setOpening(id);
    try { await api('/api/pharmacies/switch', { method: 'POST', json: { pharmacy_id: id } }); window.location.assign('/dashboard'); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not switch'); setOpening(null); }
  }

  const attention = (r: Row) => r.reminders_due + r.awaiting_destruction + r.stock_checks_overdue + r.discrepancies > 0 || r.status === 'past_due' || r.status === 'trial_ended';
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">Group overview</h1>
      <p className="mb-4 text-sm text-muted-foreground">Every pharmacy you’re superintendent of. Opening one locks the screen and asks for your PIN there.</p>
      {error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {!rows && !error && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {rows?.map((r) => (
          <div key={r.id} className={`card ${attention(r) ? 'ring-1 ring-amber-300 dark:ring-amber-700' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold"><Building2 className="h-4 w-4 flex-shrink-0 text-primary" /><span className="truncate">{r.name}</span>{r.current && <span className="badge bg-brand/15 text-primary">Signed in here</span>}</p>
                {r.address && <p className="truncate text-xs text-muted-foreground">{r.address}</p>}
              </div>
              {r.status && <span className={`badge ${r.status === 'past_due' || r.status === 'trial_ended' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-muted text-muted-foreground'}`}>{STATUS[r.status] ?? r.status}</span>}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Stat label="Registers" value={r.registers} />
              <Stat label="Entries this week" value={r.entries_7d} />
              <Stat label="Late entries (30 days)" value={r.late_30d} warn={r.late_30d > 0} icon={Clock} />
              <Stat label="Reminders due" value={r.reminders_due} warn={r.reminders_due > 0} icon={BellRing} />
              <Stat label="Awaiting destruction" value={r.awaiting_destruction} warn={r.awaiting_destruction > 0} icon={Flame} />
              <Stat label={`Stock checks overdue (${r.stock_check_frequency})`} value={r.stock_check_frequency === 'off' ? '-' : r.stock_checks_overdue} warn={r.stock_checks_overdue > 0} icon={ClipboardCheck} />
            </dl>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Last stock check: {r.last_stock_check ? new Date(r.last_stock_check).toLocaleDateString('en-IE') : 'none yet'}
                {r.discrepancies > 0 && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> {r.discrepancies} register{r.discrepancies === 1 ? '' : 's'} didn’t match at last count</span>}
              </span>
              <button onClick={() => open(r.id, r.current)} disabled={!!opening} className="btn-secondary py-1.5 text-sm">{opening === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Open <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, warn, icon: Icon }: { label: string; value: number | string; warn?: boolean; icon?: any }) {
  return (
    <div className={`rounded-lg p-2 ${warn ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100' : 'bg-muted/60'}`}>
      <dt className="flex items-center gap-1 text-[11px] leading-tight opacity-80">{Icon && <Icon className="h-3 w-3" />}{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
