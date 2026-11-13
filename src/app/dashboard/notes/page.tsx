'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Pin, PinOff, Archive, ArchiveRestore, Loader2, StickyNote, Paperclip, BookOpen } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/modal';
import { useStaff } from '@/components/dashboard/staff-context';
import { NoteAttachments, type Attachment } from '@/components/dashboard/note-attachments';
import { productTitle } from '@/lib/product-name';

interface Note {
  id: string; title: string; body: string; category: string | null; pinned: boolean; archived: boolean;
  register_id: string | null; register_label: string | null; stock_check_id: string | null;
  created_by_name: string; created_at: string; updated_by_name: string | null; updated_at: string; attachments: Attachment[];
}
const SUGGESTED = ['Stock discrepancy', 'Investigation', 'SOP', 'Inspection', 'Supplier', 'Patient', 'Reminder', 'Training'];
const when = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });

/** Linkify URLs in a note's text. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <p className="whitespace-pre-wrap break-words text-sm">{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="text-primary underline">{p}</a> : p))}</p>;
}

export default function NotesPage() {
  const { staff } = useStaff();
  const canEdit = !!staff && staff.role !== 'read_only';
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [registerId, setRegisterId] = useState<string | null>(null);
  const [open, setOpen] = useState<Note | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => api(`/api/notes${archived ? '?archived=1' : ''}`).then((d) => { setNotes(d.notes); setNeedsMigration(!!d.needs_migration); }).catch(() => setNotes([])), [archived]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setOpenId(sp.get('open')); setRegisterId(sp.get('register_id'));
    if (sp.get('new')) setOpen('new');
  }, []);
  useEffect(() => { if (openId && notes) { const n = notes.find((x) => x.id === openId); if (n) setOpen(n); setOpenId(null); } }, [openId, notes]);

  const cats = useMemo(() => Array.from(new Set((notes ?? []).map((n) => n.category).filter(Boolean) as string[])).sort(), [notes]);
  const shown = (notes ?? []).filter((n) => (!cat || n.category === cat) && (!registerId || n.register_id === registerId)
    && (!q || `${n.title} ${n.body} ${n.category ?? ''} ${n.register_label ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notes</h1>
          <p className="text-sm text-muted-foreground">Investigations, SOPs, inspection notes, with photos and scans. Link a note to a CD register.</p>
        </div>
        {canEdit && <button onClick={() => setOpen('new')} className="btn-primary"><Plus className="h-4 w-4" /> New note</button>}
      </div>
      {needsMigration && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Needs a one-off database update: run migration 0012 in Supabase.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="input pl-9" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button onClick={() => setArchived(!archived)} className="btn-ghost text-sm">{archived ? <><ArchiveRestore className="h-4 w-4" /> Current notes</> : <><Archive className="h-4 w-4" /> Archived</>}</button>
      </div>
      {(cats.length > 0 || registerId) && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => { setCat(null); setRegisterId(null); }} className={`rounded-full border px-3 py-1 text-xs font-semibold ${!cat && !registerId ? 'border-brand bg-brand text-white' : 'border-border'}`}>All</button>
          {registerId && <span className="rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-semibold">{notes?.find((n) => n.register_id === registerId)?.register_label ?? 'This register'}</span>}
          {cats.map((c) => <button key={c} onClick={() => setCat(cat === c ? null : c)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${cat === c ? 'border-brand bg-brand text-white' : 'border-border'}`}>{c}</button>)}
        </div>
      )}

      {notes === null ? <p className="text-sm text-muted-foreground">Loading…</p> : shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><StickyNote className="h-8 w-8" /><p>{archived ? 'No archived notes.' : 'No notes yet.'}</p></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((n) => (
            <button key={n.id} onClick={() => setOpen(n)} className="card flex flex-col gap-2 p-4 text-left transition hover:border-brand">
              <span className="flex items-start justify-between gap-2"><span className="font-semibold">{n.title}</span>{n.pinned && <Pin className="h-4 w-4 flex-shrink-0 text-brand" />}</span>
              <span className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{n.body || '-'}</span>
              <span className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {n.category && <span className="badge bg-secondary">{n.category}</span>}
                {n.register_label && <span className="badge bg-brand/10 text-primary"><BookOpen className="mr-1 h-3 w-3" />{n.register_label}</span>}
                {n.attachments?.length > 0 && <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{n.attachments.length}</span>}
                <span className="ml-auto">{when(n.updated_at)} · {n.updated_by_name ?? n.created_by_name}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => { setOpen(null); load(); }} title={open === 'new' ? 'New note' : 'Note'}>
        {open && <NoteEditor key={open === 'new' ? 'new' : open.id} note={open === 'new' ? null : open} categories={Array.from(new Set([...cats, ...SUGGESTED]))} canEdit={canEdit} defaultRegister={registerId} onSaved={(n) => setOpen(n)} onClose={() => { setOpen(null); load(); }} />}
      </Modal>
    </div>
  );
}

function NoteEditor({ note, categories, canEdit, defaultRegister, onSaved, onClose }: { note: Note | null; categories: string[]; canEdit: boolean; defaultRegister: string | null; onSaved: (n: Note) => void; onClose: () => void }) {
  const [f, setF] = useState({ title: note?.title ?? '', body: note?.body ?? '', category: note?.category ?? '', register_id: note?.register_id ?? defaultRegister ?? '', pinned: note?.pinned ?? false });
  const [regs, setRegs] = useState<{ id: string; label: string }[]>([]);
  const [atts, setAtts] = useState<Attachment[]>(note?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api('/api/registers').then((d) => setRegs(d.registers.map((r: any) => ({ id: r.id, label: productTitle(r.product) })))).catch(() => {}); }, []);

  async function save(extra: Partial<Note> = {}) {
    setBusy(true); setError(null); setSaved(false);
    const json = { ...f, category: f.category || null, register_id: f.register_id || null, ...extra };
    try {
      const d = note ? await api(`/api/notes/${note.id}`, { method: 'PATCH', json }) : await api('/api/notes', { method: 'POST', json });
      onSaved({ ...(note ?? {}), ...d.note, attachments: atts, register_label: regs.find((r) => r.id === d.note.register_id)?.label ?? null });
      setSaved(true);
      return d.note;
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); }
    finally { setBusy(false); }
  }

  if (!canEdit && note) return (
    <div className="space-y-3"><h3 className="text-lg font-semibold">{note.title}</h3><Body text={note.body} /><NoteAttachments noteId={note.id} attachments={atts} canEdit={false} onChanged={setAtts} /></div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
      <div><label className="label">Title</label><input className="input font-semibold" required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus={!note} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Category</label><input className="input" list="note-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Pick or type your own" /><datalist id="note-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></div>
        <div><label className="label">Linked register</label><select className="input" value={f.register_id} onChange={(e) => setF({ ...f, register_id: e.target.value })}><option value="">None</option>{regs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
      </div>
      <div><label className="label">Note</label><textarea className="input min-h-[160px]" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Write anything: links (https://…) become clickable." /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#54BD50]" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to the top</label>

      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-semibold">Photos &amp; scans</p>
        {note ? <NoteAttachments noteId={note.id} attachments={atts} canEdit onChanged={setAtts} /> : <p className="text-sm text-muted-foreground">Save the note first, then add photos.</p>}
      </div>
      {note?.register_id && <Link href={`/dashboard/register/${note.register_id}`} className="block text-sm font-semibold text-primary underline">Open the linked register →</Link>}
      {note && <p className="text-xs text-muted-foreground">Created {when(note.created_at)} by {note.created_by_name}{note.updated_by_name ? ` · last edited by ${note.updated_by_name}` : ''}. Edits are kept in the audit trail.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex-1" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {note ? 'Save' : 'Save note'}</button>
        {note && <button type="button" onClick={async () => { await save({ archived: !note.archived }); onClose(); }} className="btn-ghost">{note.archived ? <><ArchiveRestore className="h-4 w-4" /> Restore</> : <><Archive className="h-4 w-4" /> Archive</>}</button>}
        {note && <button type="button" onClick={() => { setF({ ...f, pinned: !f.pinned }); }} className="btn-ghost" aria-label="Toggle pin">{f.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>}
      </div>
      {saved && <p className="text-sm text-brand">Saved.</p>}
    </form>
  );
}
