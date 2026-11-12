'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Stethoscope, Truck, UserCheck, ClipboardPaste, Loader2, Trash2, Search, Check, Landmark } from 'lucide-react';
import { KNOWN_SUPPLIERS } from '@/lib/invoice-rules';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/modal';
import { QuickFillInput } from '@/components/dashboard/quickfill-input';

type Kind = 'prescriber' | 'supplier' | 'witness';
type Tab = Kind | 'gms';
interface Contact { id: string; kind: Kind; name: string; address: string | null; registration: string | null; gms_number: string | null; role: string | null }

const TABS: { kind: Tab; label: string; icon: any; hint: string }[] = [
  { kind: 'prescriber', label: 'My doctors', icon: Stethoscope, hint: 'Your regular doctors and prescribers. You don’t need everyone — every GMS GP in Ireland is suggested automatically, and anyone already in your register too.' },
  { kind: 'gms', label: 'All GMS GPs', icon: Landmark, hint: 'Every GP on the HSE GMS scheme in Ireland. These are suggested automatically when you type a prescriber — add your regulars to My doctors to see them first.' },
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
  const [tab, setTab] = useState<Tab>('prescriber');
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
          {tab !== 'gms' && <button onClick={() => setPasting(true)} className="btn-secondary"><ClipboardPaste className="h-4 w-4" /> Paste a list</button>}
          {tab !== 'gms' && <button onClick={() => setEditing({ kind: tab })} className="btn-primary"><Plus className="h-4 w-4" /> Add</button>}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1 sm:grid-cols-4">
        {TABS.map((x) => (
          <button key={x.kind} onClick={() => setTab(x.kind)} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold ${tab === x.kind ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
            <x.icon className="h-4 w-4" /> {x.label} {x.kind !== 'gms' && <span className="text-xs font-normal text-muted-foreground">{list.filter((c) => c.kind === x.kind).length}</span>}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t.hint}</p>

      {tab === 'gms' && <GmsBrowser mine={list} onAdded={load} />}
      {tab === 'supplier' && <CommonSuppliers mine={list} onAdded={load} />}
      {tab !== 'gms' && <div className="card divide-y divide-border p-0">
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
      </div>}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit' : `Add ${t.label.toLowerCase().replace(/s$/, '')}`}>
        {editing && <ContactForm initial={editing} onDone={() => { setEditing(null); load(); }} />}
      </Modal>
       <Modal open={pasting} onClose={() => setPasting(false)} title={`Paste ${t.label.toLowerCase()}`} wide>
        <PasteForm kind={tab as Kind} onDone={() => { setPasting(false); load(); }} />
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

function CommonSuppliers({ mine, onAdded }: { mine: Contact[]; onAdded: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const have = (re: RegExp) => mine.some((c) => c.kind === 'supplier' && re.test(c.name));
  const missing = KNOWN_SUPPLIERS.filter((k) => !have(k.match));
  if (!missing.length) return null;
  const add = async (names: typeof missing) => {
    setBusy(names.length > 1 ? 'all' : names[0].key);
    try { await api('/api/contacts', { method: 'POST', json: { contacts: names.map((k) => ({ kind: 'supplier', name: k.name, address: k.address })) } }); onAdded(); }
    finally { setBusy(null); }
  };
  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Common Irish suppliers</p>
        {missing.length > 1 && <button onClick={() => add(missing)} disabled={!!busy} className="btn-secondary text-sm">{busy === 'all' && <Loader2 className="h-4 w-4 animate-spin" />} Add all</button>}
      </div>
      <div className="flex flex-wrap gap-2">
        {missing.map((k) => (
          <button key={k.key} onClick={() => add([k])} disabled={!!busy} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:border-brand hover:bg-brand/5">
            {busy === k.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {k.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Any supplier you record a delivery from is saved here automatically, with its address.</p>
    </div>
  );
}

function GmsBrowser({ mine, onAdded }: { mine: Contact[]; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ g: string; n: string; a: string | null; r: string | null }[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fetchPage = useCallback(async (query: string, offset: number) => {
    const d = await api(`/api/gms?q=${encodeURIComponent(query)}&offset=${offset}`);
    setTotal(d.total); setDate(d.list_date);
    setItems((prev) => (offset ? [...prev, ...d.items] : d.items));
  }, []);
  useEffect(() => { const t = setTimeout(() => fetchPage(q, 0), 200); return () => clearTimeout(t); }, [q, fetchPage]);
  const saved = new Set(mine.filter((c) => c.kind === 'prescriber').map((c) => c.gms_number || c.name.toLowerCase()));
  const add = async (x: (typeof items)[number]) => {
    setBusy(x.g);
    try { await api('/api/contacts', { method: 'POST', json: { kind: 'prescriber', name: x.n, address: x.a, gms_number: x.g } }); onAdded(); }
    finally { setBusy(null); }
  };
  return (
    <div className="space-y-3">
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="input pl-9" placeholder="Search name, town, county or GMS no." value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {total !== null && <p className="text-xs text-muted-foreground">{total.toLocaleString()} GP{total === 1 ? '' : 's'} · HSE list published {date}</p>}
      <div className="card divide-y divide-border p-0">
        {items.map((x) => {
          const isSaved = saved.has(x.g) || saved.has(x.n.toLowerCase());
          return (
            <div key={x.g} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block font-medium">{x.n}</span>
                <span className="block text-sm text-muted-foreground">{x.a || '—'}</span>
              </span>
              <span className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">GMS {x.g}</span>
                {isSaved ? <span className="flex items-center gap-1 text-xs font-semibold text-brand"><Check className="h-3.5 w-3.5" /> My doctor</span>
                  : <button onClick={() => add(x)} disabled={busy === x.g} className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:border-brand">{busy === x.g ? <Loader2 className="h-3 w-3 animate-spin" /> : '+ My doctors'}</button>}
              </span>
            </div>
          );
        })}
        {total === 0 && <p className="p-5 text-sm text-muted-foreground">No GP matches.</p>}
      </div>
      {total !== null && items.length < total && <button onClick={() => fetchPage(q, items.length)} className="btn-secondary w-full">Show more</button>}
    </div>
  );
}
