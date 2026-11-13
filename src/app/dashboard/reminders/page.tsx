'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, Plus, Pencil, Pause, Play, Trash2, SkipForward, CheckCircle2, CalendarClock } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/modal';
import { useStaff } from '@/components/dashboard/staff-context';
import { ReminderForm, type ReminderData } from '@/components/dashboard/reminder-form';
import { RepeatSupplies, type SupplyLine } from '@/components/dashboard/repeat-supplies';
import { describe, type Frequency } from '@/lib/reminders';

interface Line { register_id: string; quantity: number; recipient_name: string; recipient_address: string; prescriber_name: string | null; prescriber_address: string | null; authority_to_possess: string | null; patient_id: string | null; label: string; unit: string; balance: number; closed: boolean }
interface Reminder { id: string; title: string; frequency: Frequency; interval_days: number | null; next_due: string; notes: string | null; active: boolean; due: boolean; lines: Line[]; last_done_on: string | null; last_done_by_name: string | null }

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
const daysFrom = (d: string) => Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()) / 86400000);

export default function RemindersPage() {
  const { refresh } = useStaff();
  const [list, setList] = useState<Reminder[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [editing, setEditing] = useState<Partial<ReminderData> | null>(null);
  const [recording, setRecording] = useState<Reminder | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api('/api/reminders').then((d) => { setList(d.reminders); setNeedsMigration(!!d.needs_migration); refresh(); }).catch(() => setList([])), [refresh]);
  useEffect(() => { load(); }, [load]);

  const act = async (r: Reminder, fn: () => Promise<unknown>, done: string) => {
    try { await fn(); setMsg(done); load(); } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Something went wrong'); }
  };
  const due = (list ?? []).filter((r) => r.due);
  const upcoming = (list ?? []).filter((r) => r.active && !r.due);
  const paused = (list ?? []).filter((r) => !r.active);

  const card = (r: Reminder) => {
    const d = daysFrom(r.next_due);
    return (
      <div key={r.id} className={`card space-y-3 ${r.due ? 'border-amber-300 dark:border-amber-700' : ''} ${!r.active ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{r.title}</p>
            <p className="text-sm text-muted-foreground">{describe(r.frequency, r.interval_days)} · {r.active ? (d < 0 ? <b className="text-amber-700">overdue since {fmt(r.next_due)}</b> : d === 0 ? <b className="text-amber-700">due today</b> : `next ${fmt(r.next_due)}`) : 'paused'}{r.last_done_on ? ` · last done ${fmt(r.last_done_on)} by ${r.last_done_by_name}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setEditing({ ...r, lines: r.lines })} className="btn-ghost px-2 py-1.5" title="Edit" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => act(r, () => api(`/api/reminders/${r.id}`, { method: 'PATCH', json: { active: !r.active } }), r.active ? 'Paused.' : 'Resumed.')} className="btn-ghost px-2 py-1.5" title={r.active ? 'Pause' : 'Resume'} aria-label={r.active ? 'Pause' : 'Resume'}>{r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
            <button onClick={() => confirm(`Delete the reminder “${r.title}”? Nothing in the registers changes.`) && act(r, () => api(`/api/reminders/${r.id}`, { method: 'DELETE' }), 'Deleted.')} className="btn-ghost px-2 py-1.5" title="Delete" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {r.lines.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span><b>{l.label}</b> — {Number(l.quantity)} {l.unit} to {l.recipient_name}</span>
              <span className={`text-xs ${l.balance < l.quantity ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{l.closed ? 'register closed' : `in stock ${l.balance}`}</span>
            </li>
          ))}
        </ul>
        {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
        {r.due && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setRecording(r)} className="btn-primary flex-1"><CheckCircle2 className="h-4 w-4" /> Record {r.lines.length > 1 ? `all ${r.lines.length}` : 'it'} now</button>
            <button onClick={() => confirm('Skip this time? Nothing is recorded; the reminder moves to its next date.') && act(r, () => api(`/api/reminders/${r.id}/done`, { method: 'POST', json: { action: 'skipped' } }), 'Skipped — moved to the next date.')} className="btn-secondary"><SkipForward className="h-4 w-4" /> Skip this time</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dispensing reminders</h1>
          <p className="text-sm text-muted-foreground">Regular supplies (daily, weekly, every 2 or 4 weeks, monthly). When one is due, record it in the registers with one click.</p>
        </div>
        <button onClick={() => setEditing({})} className="btn-primary"><Plus className="h-4 w-4" /> New reminder</button>
      </div>
      {needsMigration && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run migration 0012 in Supabase.</p>}
      {msg && <p className="rounded-lg bg-secondary p-3 text-sm">{msg}</p>}
      <p className="text-sm text-muted-foreground">Tip: on a register, select one or more supply rows and choose <b>Set up reminder</b>.</p>

      {list === null ? <p className="text-sm text-muted-foreground">Loading…</p> : list.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><BellRing className="h-8 w-8" /><p>No reminders yet.</p></div>
      ) : (
        <>
          {due.length > 0 && <section className="space-y-3"><h2 className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200"><BellRing className="h-4 w-4" /> Due now</h2>{due.map(card)}</section>}
          {upcoming.length > 0 && <section className="space-y-3"><h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" /> Coming up</h2>{upcoming.map(card)}</section>}
          {paused.length > 0 && <section className="space-y-3"><h2 className="font-semibold text-muted-foreground">Paused</h2>{paused.map(card)}</section>}
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit reminder' : 'New dispensing reminder'} wide>
        {editing && <ReminderForm initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setMsg('Saved.'); load(); }} />}
      </Modal>
      <Modal open={!!recording} onClose={() => { setRecording(null); load(); }} title={recording ? `Record — ${recording.title}` : ''} wide>
        {recording && (
          <RepeatSupplies unit={recording.lines[0]?.unit ?? 'units'} balance={0}
            balances={Object.fromEntries(recording.lines.map((l) => [l.register_id, l.balance]))}
            lines={recording.lines.map((l, i): SupplyLine => ({ id: `${recording.id}-${i}`, seq: 0, transaction_date: '', quantity: l.quantity, recipient_name: l.recipient_name, recipient_address: l.recipient_address, prescriber_name: l.prescriber_name, prescriber_address: l.prescriber_address, authority_to_possess: l.authority_to_possess, prescription_ref: null, patient_id: l.patient_id, register_id: l.register_id, label: l.label, unit: l.unit }))}
            onAllSaved={async (n) => { await api(`/api/reminders/${recording.id}/done`, { method: 'POST', json: { action: 'recorded', recorded: n } }); setMsg(`Recorded — “${recording.title}” moved to its next date.`); }}
            onCancel={() => { setRecording(null); load(); }} onDone={() => { setRecording(null); load(); }} />
        )}
      </Modal>
    </div>
  );
}
