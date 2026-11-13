'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Loader2, CheckCircle2, AlertTriangle, Scale } from 'lucide-react';
import { NoteAttachments, type Attachment } from './note-attachments';
import { Modal } from '@/components/modal';
import { api, ApiError } from '@/lib/api';

interface Check { id: string; counted: number; register_balance: number; notes: string | null; checked_by_name: string; checked_at: string }

/** Count the stock and record it against the register balance. Differences are recorded, never auto-fixed. */
export function StockCheckButton({ registerId, unit, balance, canRecord, onChanged }: { registerId: string; unit: string; balance: number; canRecord: boolean; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [amending, setAmending] = useState<Check | null>(null);

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
      setDone(d.diff === 0 ? `Recorded: ${n} ${unit} — matches the register.` : `Recorded with a difference of ${d.diff > 0 ? '+' : ''}${d.diff} ${unit}. Investigate first (recount, check recent entries, invoices and Rxs). If it still doesn’t match, you can amend the balance below.`);
      if (d.diff !== 0 && canRecord) setAmending(d.check);
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
              <div><label className="label">Counted in the CD safe ({unit})</label><input className="input text-lg font-semibold" type="number" min="0" step="any" inputMode="decimal" required value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus /><p className="mt-1 text-xs text-muted-foreground">Include any stock set aside for destruction — it stays in the balance until destroyed.</p></div>
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
          {amending && <AmendBalance check={amending} unit={unit} onDone={() => { setAmending(null); setDone(null); onChanged?.(); api(`/api/stock-checks?register_id=${registerId}`).then((x) => setChecks(x.checks)); }} onCancel={() => setAmending(null)} />}
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
                      {d !== 0 && canRecord && c === checks[0] && Number(c.register_balance) === balance && !amending && <button type="button" onClick={() => setAmending(c)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary underline"><Scale className="h-3 w-3" /> Amend balance to {c.counted}</button>}
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

/** Bring the register into line with the count: a signed STOCK ADJUSTMENT line plus what was done to investigate. */
function AmendBalance({ check, unit, onDone, onCancel }: { check: Check; unit: string; onDone: () => void; onCancel: () => void }) {
  const diff = Number(check.counted) - Number(check.register_balance);
  const [text, setText] = useState('');
  const [saveNote, setSaveNote] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ seq: number; noteId: string | null } | null>(null);
  const [atts, setAtts] = useState<Attachment[]>([]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await api(`/api/stock-checks/${check.id}/adjust`, { method: 'POST', json: { investigation: text, save_note: saveNote } });
      setResult({ seq: d.entry.seq, noteId: d.note?.id ?? null });
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not amend the balance'); }
    finally { setBusy(false); }
  }
  if (result) return (
    <div className="space-y-3 rounded-xl border border-brand/40 bg-brand/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-brand" /> Balance amended to {Number(check.counted)} {unit} — register line {result.seq}.</p>
      {result.noteId && (<>
        <p>Investigation saved as a note. Add photos (e.g. invoices, Rx, the count sheet):</p>
        <NoteAttachments noteId={result.noteId} attachments={atts} canEdit onChanged={setAtts} />
        <Link href={`/dashboard/notes?open=${result.noteId}`} className="inline-block font-semibold text-primary underline">Open the note →</Link>
      </>)}
      <button type="button" onClick={onDone} className="btn-primary w-full">Done</button>
    </div>
  );
  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-violet-300 bg-violet-50 p-3 text-sm dark:border-violet-800 dark:bg-violet-950/40">
      <p className="font-semibold">Amend the register balance from {Number(check.register_balance)} to {Number(check.counted)} {unit} ({diff > 0 ? '+' : ''}{diff})</p>
      <p className="text-muted-foreground">This adds a signed <b>stock adjustment</b> line to the register — nothing is overwritten. Only do this once you’ve investigated. An unexplained loss should be reported in line with PSI guidance.</p>
      <div><label className="label">What did you do to investigate, and what did you find?</label>
        <textarea className="input min-h-[96px]" required minLength={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Recounted twice with a second pharmacist. Checked supplies since last check against Rxs and invoices — Uniphar invoice 12345 received 20 but recorded 10." /></div>
      <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#54BD50]" checked={saveNote} onChange={(e) => setSaveNote(e.target.checked)} /> Also save as a note (you can add photos to it)</label>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy || text.trim().length < 10}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign &amp; amend balance</button>
        <button type="button" onClick={onCancel} className="btn-ghost">Not now</button>
      </div>
    </form>
  );
}
