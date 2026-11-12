'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Stethoscope, Truck, UserCheck, ClipboardPaste, Loader2, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/modal';
import { QuickFillInput } from '@/components/dashboard/quickfill-input';

type Kind = 'prescriber' | 'supplier' | 'witness';
interface Contact { id: string; kind: Kind; name: string; address: string | null; registration: string | null; gms_number: string | null; role: string | null }

const TABS: { kind: Kind; label: string; icon: any; hint: string }[] = [
  { kind: 'prescriber', label: 'Doctors', icon: Stethoscope, hint: 'Your regular GMS doctors and prescribers. You don’t need everyone — anyone already in your register is suggested automatically too.' },
  { kind: 'supplier', label: 'Suppliers', icon: Truck, hint: 'Wholesalers and other suppliers you receive controlled drugs from.' },
  { kind: 'witness', label: 'Witnesses', icon: UserCheck, hint: 'People who usually witness destructions, with their capacity.' },
];

/** Parse pasted lines: "Name | Address | IMC no | GMS no" (tabs or commas also work). */
function parsePaste(text: string, kind: Kind) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = (line.includes('|') ? line.split('|') : line.includes('\t') ? line.split('\t') : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((p) => p.trim().replace(/^"|"$/g, ''));
    const [name, address, a, b] = parts;
    return kind === 'witness'
      ? { kind, name, role: address || null }
      : { kind, name, address: address || null, registration: kind === 'prescriber' ? a || null : null, gms_number: kind === 'prescriber' ? b || null : null };
  }).filter((c) => c.name && c.name.length >= 2);
}

export default function ContactsPage() {
  const [tab, setTab] = useState<Kind>('prescriber');
  const [list, setList] = useState<Contact[]>([]);
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [pasting, setPasting] = useState(false);
  const load = useCallback(() => api('/api/contacts').then((d) => setList(d.contacts)), []);
  useEffect(() => { load(); }, [load]);
  const shown = list.filter((c) => c.kind === tab);
  const t = TABS.find((x) => x.kind === tab)!;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Doctors &amp; suppliers</h1>
          <p className="text-sm text-muted-foreground">Quick-fill when making entries. Changing a contact never changes past register entries.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPasting(true)} className="btn-secondary"><ClipboardPaste className="h-4 w-4" /> Paste a list</button>
          <button onClick={() => setEditing({ kind: tab })} className="btn-primary"><Plus className="h-4 w-4" /> Add</button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-muted p-1">
        {TABS.map((x) => (
          <button key={x.kind} onClick={() => setTab(x.kind)} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold ${tab === x.kind ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
            <x.icon className="h-4 w-4" /> {x.label} <span className="text-xs font-normal text-muted-foreground">{list.filter((c) => c.kind === x.kind).length}</span>
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t.hint}</p>

      <div className="card divide-y divide-border p-0">
        {shown.length === 0 && <p className="p-5 text-sm text-muted-foreground">None yet — add one, or paste a list.</p>}
        {shown.map((c) => (
          <button key={c.id} onClick={() => setEditing(c)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50">
            <span>
              <span className="block font-medium">{c.name}</span>
              <span className="block text-sm text-muted-foreground">{c.address || c.role || '—'}</span>
            </span>
            <span className="text-right text-xs text-muted-foreground">
              {c.registration && <span className="block">IMC {c.registration}</span>}
              {c.gms_number && <span className="block">GMS {c.gms_number}</span>}
            </span>
          </button>
        ))}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit' : `Add ${t.label.toLowerCase().replace(/s$/, '')}`}>
        {editing && <ContactForm initial={editing} onDone={() => { setEditing(null); load(); }} />}
      </Modal>
      <Modal open={pasting} onClose={() => setPasting(false)} title={`Paste ${t.label.toLowerCase()}`} wide>
        <PasteForm kind={tab} onDone={() => { setPasting(false); load(); }} />
      </Modal>
    </div>
  );
}

function ContactForm({ initial, onDone }: { initial: Partial<Contact>; onDone: () => void }) {
  const [f, setF] = useState({ kind: initial.kind as Kind, name: initial.name ?? '', address: initial.address ?? '', registration: initial.registration ?? '', gms_number: initial.gms_number ?? '', role: initial.role ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true); setError(null);
    try { await api('/api/contacts', { method: 'POST', json: { ...f, id: initial.id, ...extra } }); onDone(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
      <div><label className="label">{f.kind === 'prescriber' ? 'Doctor / prescriber name' : 'Name'}</label>
        {f.kind === 'prescriber' && !initial.id ? (
          <QuickFillInput kind="prescriber" required value={f.name} onChange={(v) => setF({ ...f, name: v })} onPick={(p) => setF({ ...f, name: p.name, address: p.address ?? f.address, gms_number: p.gms_number ?? f.gms_number, registration: p.registration ?? f.registration })} placeholder="Type a name or GMS no. — searches the HSE GMS list" />
        ) : (
          <input className="input" required value={f.name} onChange={set('name')} />
        )}
      </div>
      {f.kind !== 'witness' && <div><label className="label">{f.kind === 'prescriber' ? 'Practice address' : 'Address'}</label><input className="input" value={f.address} onChange={set('address')} /></div>}
      {f.kind === 'prescriber' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Medical Council (IMC) no.</label><input className="input" inputMode="numeric" value={f.registration} onChange={set('registration')} /></div>
          <div><label className="label">GMS doctor no.</label><input className="input" value={f.gms_number} onChange={set('gms_number')} /></div>
        </div>
      )}
      {f.kind === 'witness' && <div><label className="label">Capacity</label><input className="input" value={f.role} onChange={set('role')} placeholder="e.g. Authorised officer" /></div>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        {initial.id && <button type="button" onClick={() => save({ is_active: false })} className="btn-ghost text-destructive"><Trash2 className="h-4 w-4" /> Remove</button>}
        <button className="btn-primary flex-1" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
      </div>
    </form>
  );
}

function PasteForm({ kind, onDone }: { kind: Kind; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = parsePaste(text, kind);
  const example = kind === 'prescriber' ? 'Dr Áine Walsh | Ennis Medical Centre, Ennis, Co. Clare | 012345 | G1234\nDr Kevin Ryan | Abbey St Surgery, Ennis | 023456 | G2345' : kind === 'supplier' ? 'United Drug | Magna Business Park, Citywest, Dublin 24' : 'P. Doyle | Authorised officer';
  async function save() {
    setBusy(true); setMsg(null);
    try { const d = await api('/api/contacts', { method: 'POST', json: { contacts: rows } }); setMsg(`Added ${d.added} (duplicates skipped)`); setTimeout(onDone, 900); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">One per line: {kind === 'prescriber' ? <b>Name | Practice address | IMC no. | GMS no.</b> : kind === 'supplier' ? <b>Name | Address</b> : <b>Name | Capacity</b>}. Copy from a spreadsheet (tabs) or separate with |.</p>
      <textarea className="input min-h-[180px] font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={example} />
      {rows.length > 0 && <p className="text-sm">{rows.length} ready to add — first: <b>{rows[0].name}</b>{'address' in rows[0] && rows[0].address ? `, ${rows[0].address}` : ''}</p>}
      {msg && <p className="text-sm">{msg}</p>}
      <button onClick={save} disabled={busy || !rows.length} className="btn-primary w-full">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add {rows.length || ''}</button>
    </div>
  );
}
