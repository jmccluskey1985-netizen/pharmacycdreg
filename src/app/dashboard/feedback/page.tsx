'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Bug, MessageSquare, Loader2, ThumbsUp, Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStaff } from '@/components/dashboard/staff-context';

type Kind = 'idea' | 'problem' | 'other';
interface Fb { id: string; kind: Kind; message: string; status: string; reply: string | null; created_at: string; pharmacy_name?: string | null; staff_name?: string | null; shared?: boolean; shared_title?: string | null; votes?: number }
interface Idea { id: string; kind: Kind; status: string; shared_title: string; reply: string | null; votes: number; voted: boolean }

const KINDS: { k: Kind; label: string; icon: any; hint: string }[] = [
  { k: 'idea', label: 'Suggest a feature', icon: Lightbulb, hint: 'What would make the register easier for you?' },
  { k: 'problem', label: 'Report a problem', icon: Bug, hint: 'What happened, and what did you expect?' },
  { k: 'other', label: 'Something else', icon: MessageSquare, hint: 'Anything you want to tell us' },
];
const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100' },
  read: { label: 'Received', cls: 'bg-secondary' },
  planned: { label: 'Planned', cls: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100' },
  done: { label: 'Done', cls: 'bg-brand/15 text-primary' },
  declined: { label: 'Not planned', cls: 'bg-muted text-muted-foreground' },
};
const when = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

export default function FeedbackPage() {
  const [d, setD] = useState<{ mine: Fb[]; ideas: Idea[]; all: Fb[] | null; is_admin: boolean; needs_migration?: boolean } | null>(null);
  const [kind, setKind] = useState<Kind>('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { refresh } = useStaff();
  const load = useCallback(() => api('/api/feedback').then((x) => { setD(x); refresh(); }).catch(() => setD({ mine: [], ideas: [], all: null, is_admin: false })), [refresh]);
  useEffect(() => { load(); }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try { await api('/api/feedback', { method: 'POST', json: { kind, message, page: document.referrer ? new URL(document.referrer).pathname : null } }); setMessage(''); setNote('Thank you — it’s been sent. You’ll see any reply below.'); load(); }
    catch (err) { setNote(err instanceof ApiError ? err.message : 'Could not send'); }
    finally { setBusy(false); }
  }
  async function vote(id: string) { await api(`/api/feedback/${id}/vote`, { method: 'POST' }).catch(() => {}); load(); }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feedback &amp; ideas</h1>
        <p className="text-sm text-muted-foreground">{d?.is_admin ? 'Everything pharmacies send comes here, and to your email.' : 'Goes straight to the PharmacyCDReg.ie team. Tell us what would help, report a problem, and vote on ideas from other pharmacies.'}</p>
      </div>
      {d?.is_admin && d.all && <AdminList items={d.all} onChanged={load} />}
      {d?.needs_migration && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run migration 0012 in Supabase.</p>}

      <form onSubmit={send} className="card space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((x) => (
            <button key={x.k} type="button" onClick={() => setKind(x.k)} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold transition ${kind === x.k ? 'border-brand bg-brand/10' : 'border-border hover:border-brand'}`}><x.icon className="h-5 w-5 text-brand" /> {x.label}</button>
          ))}
        </div>
        <textarea className="input min-h-[120px]" required minLength={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={KINDS.find((x) => x.k === kind)!.hint} />
        <p className="text-xs text-muted-foreground">Please don’t include patient details.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || message.trim().length < 3}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send</button>
          {note && <span className="text-sm">{note}</span>}
        </div>
      </form>

      {d && d.ideas.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Ideas board</h2>
          <p className="text-sm text-muted-foreground">Vote for the ideas you’d use most — it helps decide what’s built next.</p>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {d.ideas.map((i) => (
              <div key={i.id} className="flex items-start gap-3 p-3">
                <button onClick={() => vote(i.id)} className={`flex w-14 flex-shrink-0 flex-col items-center rounded-lg border py-1.5 text-xs font-bold ${i.voted ? 'border-brand bg-brand text-white' : 'border-border hover:border-brand'}`} aria-pressed={i.voted} aria-label={`Vote for ${i.shared_title}`}><ThumbsUp className="h-4 w-4" />{i.votes}</button>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{i.shared_title}</p>
                  <span className={`badge mt-1 ${STATUS[i.status]?.cls}`}>{STATUS[i.status]?.label}</span>
                  {i.reply && <p className="mt-1 text-muted-foreground">{i.reply}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Your messages</h2>
        {!d ? <p className="text-sm text-muted-foreground">Loading…</p> : d.mine.length === 0 ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
          <div className="space-y-2">
            {d.mine.map((f) => (
              <div key={f.id} className="card space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{KINDS.find((x) => x.k === f.kind)?.label}</span><span className={`badge ${STATUS[f.status]?.cls}`}>{STATUS[f.status]?.label}</span></div>
                <p className="whitespace-pre-wrap">{f.message}</p>
                <p className="text-xs text-muted-foreground">{when(f.created_at)} · {f.staff_name}</p>
                {f.reply && <p className="rounded-lg bg-secondary p-2"><b>Reply:</b> {f.reply}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

function AdminList({ items, onChanged }: { items: Fb[]; onChanged: () => void }) {
  const [filter, setFilter] = useState<'new' | 'all' | Kind>('new');
  const fresh = items.filter((f) => f.status === 'new').length;
  const shown = items.filter((f) => (filter === 'new' ? f.status === 'new' : filter === 'all' ? true : f.kind === filter));
  return (
    <section className="space-y-3 rounded-2xl border-2 border-brand/40 bg-brand/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Inbox — from pharmacies {fresh > 0 && <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{fresh} new</span>}</h2>
        <div className="flex flex-wrap gap-1.5">
          {([['new', 'New'], ['all', 'All'], ['idea', 'Ideas'], ['problem', 'Problems'], ['other', 'Other']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === k ? 'border-brand bg-brand text-white' : 'border-border bg-card'}`}>{l}</button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{filter === 'new' ? 'You’re all caught up.' : 'Nothing here.'}</p> : <div className="space-y-2">{shown.map((f) => <AdminRow key={f.id} f={f} onChanged={onChanged} />)}</div>}
    </section>
  );
}

function AdminRow({ f, onChanged }: { f: Fb; onChanged: () => void }) {
  const [x, setX] = useState({ status: f.status, reply: f.reply ?? '', shared: !!f.shared, shared_title: f.shared_title ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true); setErr(null);
    try { await api(`/api/feedback/${f.id}`, { method: 'PATCH', json: { ...x, status: x.status === 'new' ? 'read' : x.status, reply: x.reply || null, shared_title: x.shared_title || null } }); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  }
  return (
    <div className="card space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground"><b className="text-foreground">{f.pharmacy_name}</b> · {f.staff_name} · {when(f.created_at)} · {KINDS.find((k) => k.k === f.kind)?.label}{f.shared ? ` · ${f.votes ?? 0} votes` : ''}</p>
        {f.status === 'new' ? <button onClick={async () => { await api(`/api/feedback/${f.id}`, { method: 'PATCH', json: { status: 'read' } }).catch(() => {}); onChanged(); }} className="btn-ghost py-1 text-xs">Mark as read</button> : <span className={`badge ${STATUS[f.status]?.cls}`}>{STATUS[f.status]?.label}</span>}
      </div>
      <p className="whitespace-pre-wrap">{f.message}</p>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <select className="input py-1.5" value={x.status} onChange={(e) => setX({ ...x, status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <input className="input py-1.5" value={x.reply} onChange={(e) => setX({ ...x, reply: e.target.value })} placeholder="Reply (shown to this pharmacy, and on the ideas board if shared)" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#54BD50]" checked={x.shared} onChange={(e) => setX({ ...x, shared: e.target.checked })} /> Share on ideas board as</label>
        <input className="input flex-1 py-1.5" disabled={!x.shared} value={x.shared_title} onChange={(e) => setX({ ...x, shared_title: e.target.value })} placeholder="Short title everyone sees (no names)" />
        <button onClick={save} disabled={busy} className="btn-primary py-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
      </div>
      {err && <p className="text-destructive">{err}</p>}
    </div>
  );
}
