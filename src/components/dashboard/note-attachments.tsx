'use client';

import { useRef, useState } from 'react';
import { Camera, Paperclip, Loader2, FileText, X } from 'lucide-react';
import { compressImage } from '@/lib/compress-image';
import { api, ApiError } from '@/lib/api';

export interface Attachment { id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string; url?: string }

/** Photos / scans / PDFs on a note: take a photo or choose files; tap a thumbnail to open it. */
export function NoteAttachments({ noteId, attachments, canEdit, onChanged }: { noteId: string; attachments: Attachment[]; canEdit: boolean; onChanged: (list: Attachment[]) => void }) {
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    let list = attachments;
    for (const f of Array.from(files).slice(0, 10)) {
      try {
        const file = f.type.startsWith('image/') ? await compressImage(f, f.name || 'photo.jpg') : f;
        const fd = new FormData(); fd.append('file', file);
        const res = await fetch(`/api/notes/${noteId}/attachments`, { method: 'POST', body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Could not upload');
        list = [...list, d.attachment];
        onChanged(list);
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload'); }
    }
    setBusy(false);
  }
  async function remove(a: Attachment) {
    if (!confirm(`Remove ${a.file_name}?`)) return;
    try { await api(`/api/notes/attachments/${a.id}`, { method: 'DELETE' }); onChanged(attachments.filter((x) => x.id !== a.id)); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not remove'); }
  }

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="group relative">
              <a href={a.url ?? `/api/notes/attachments/${a.id}`} target="_blank" rel="noreferrer" title={a.file_name} className="block h-24 w-24 overflow-hidden rounded-lg border border-border bg-muted">
                {a.mime_type.startsWith('image/')
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.url ?? `/api/notes/attachments/${a.id}`} alt={a.file_name} className="h-full w-full object-cover" />
                  : <span className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center text-[10px] text-muted-foreground"><FileText className="h-6 w-6" />{a.file_name}</span>}
              </a>
              {canEdit && <button type="button" onClick={() => remove(a)} className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-card p-0.5 shadow ring-1 ring-border group-hover:block" aria-label={`Remove ${a.file_name}`}><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => cam.current?.click()} disabled={busy} className="btn-secondary py-1.5 text-sm"><Camera className="h-4 w-4" /> Take photo</button>
          <button type="button" onClick={() => pick.current?.click()} disabled={busy} className="btn-ghost py-1.5 text-sm"><Paperclip className="h-4 w-4" /> Attach file</button>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          <input ref={pick} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
