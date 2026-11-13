'use client';

import { productTitle, genericLine, brandOf } from '@/lib/product-name';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ScanLine, Users, Download, Camera, Loader2, AlertTriangle, CheckCircle2, GalleryHorizontal, Table2, ListChecks, ChevronRight, Search, X } from 'lucide-react';
import { SetupFromList } from '@/components/dashboard/setup-from-list';
import { SnapPaperRegisters } from '@/components/dashboard/snap-paper-registers';
import { Shelf, type Ghost } from '@/components/dashboard/shelf';
import { CD_PRODUCTS } from '@/data/cd-products';
import { isOpen } from '@/components/dashboard/setup-from-list';
import { filterRegisters } from '@/lib/register-filter';
import { api, ApiError } from '@/lib/api';
import { can } from '@/lib/roles';
import { useStaff } from '@/components/dashboard/staff-context';
import { Modal } from '@/components/modal';
import { canWrite } from '@/lib/stripe';

interface Reg {
  id: string;
  balance: number;
  entry_count?: number;
  ghost?: Ghost;
  low_stock?: boolean;
  check_due?: boolean;
  last_checked_at?: string | null;
  product: { drug_name: string; schedule: number; schedule_paragraph: string | null; class_name: string; form: string; strength: string; unit: string; is_stereoisomer_of: string | null; parent: { drug_name: string } | null };
}

// The bookshelf: one "book" per drug/strength/form, grouped by class (FR4, FR8).
export default function RegistersPage() {
  const { staff, pharmacy } = useStaff();
  const writable = canWrite(pharmacy?.subscription_status);
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [open, setOpen] = useState(false);
  const [fromList, setFromList] = useState(false);
  const [snap, setSnap] = useState(false);
  const [q, setQ] = useState('');
  const [view, setView] = useState<'shelf' | 'table'>('shelf');
  useEffect(() => { try { if (localStorage.getItem('cdreg-view') === 'table') setView('table'); } catch {} }, []);
  // Deep links from "New entry → New CD book" and the scanner.
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('new');
    if (n === 'register') setOpen(true); else if (n === 'list') setFromList(true); else if (n === 'paper') setSnap(true);
    if (n) window.history.replaceState(null, '', '/dashboard');
  }, []);
  const pickView = (v: 'shelf' | 'table') => { setView(v); try { localStorage.setItem('cdreg-view', v); } catch {} };

  const load = useCallback(() => api('/api/registers').then((d) => setRegs(d.registers)), []);
  useEffect(() => { load(); }, [load]);

  // "All CD types": every common CD shows on the shelf; ones not started yet are faint "Start book" cards.
  const [showAll, setShowAll] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('cdreg-all-cds') === 'off') setShowAll(false); } catch {} }, []);
  const toggleAll = () => setShowAll((v) => { try { localStorage.setItem('cdreg-all-cds', v ? 'off' : 'on'); } catch {} return !v; });
  const [starting, setStarting] = useState<Ghost | null>(null);
  const canOpen = writable && !!staff && can.openRegister(staff.role);
  const ghosts: Reg[] = !showAll || !regs || !canOpen ? [] : CD_PRODUCTS.flatMap((p) => p.strengths.filter((st) => !isOpen(regs, p, st)).map((st) => ({
    id: `ghost:${p.key}:${st}`, balance: 0, ghost: { product: p, strength: st },
    product: { drug_name: p.generic, brand: p.brands[0], class_name: p.class, strength: st, form: p.form, unit: p.unit, schedule: 2, schedule_paragraph: p.para, is_stereoisomer_of: null, parent: null },
  }) as unknown as Reg));
  const removeUnused = async (r: Reg) => {
    if (!confirm(`Remove the unused CD book for ${(r.product as any).brand ?? r.product.drug_name} ${r.product.strength}? It has no entries.`)) return;
    try { await api(`/api/registers/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { alert(e instanceof ApiError ? e.message : 'Could not remove it'); }
  };
  const shown = filterRegisters(regs ?? [], q);
  const shelfItems = filterRegisters([...(regs ?? []), ...ghosts], q);
  const groups = shown.reduce<Record<string, Reg[]>>((acc, r) => {
    const k = `Schedule ${r.product.schedule}${r.product.schedule_paragraph ? ` (${r.product.schedule_paragraph})` : ''} · ${r.product.class_name}`;
    (acc[k] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{pharmacy?.name}</p>
          <h1 className="text-2xl font-bold">Controlled Drug Registers</h1>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <a href="/api/export" className="btn-secondary" title="Download every register as one file — keep a recent copy for business continuity"><Download className="h-4 w-4" /> <span className="hidden sm:inline">Export all</span></a>
          {writable && staff && can.scan(staff.role) && <Link href="/dashboard/scan?type=invoice" className="btn-secondary"><ScanLine className="h-4 w-4" /> Invoice</Link>}
          {canOpen && view === 'shelf' && <button onClick={toggleAll} className={`btn-secondary ${showAll ? 'ring-2 ring-brand/40' : ''}`} aria-pressed={showAll} title="Show every common CD, including ones you haven't started">{showAll ? 'All CD types' : 'My books only'}</button>}
          <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="View">
            <button onClick={() => pickView('shelf')} className={`rounded-md px-2.5 py-1.5 ${view === 'shelf' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`} title="Shelf view" aria-pressed={view === 'shelf'}><GalleryHorizontal className="h-4 w-4" /></button>
            <button onClick={() => pickView('table')} className={`rounded-md px-2.5 py-1.5 ${view === 'table' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`} title="Table view" aria-pressed={view === 'table'}><Table2 className="h-4 w-4" /></button>
          </div>
          {writable && staff && can.openRegister(staff.role) && <button onClick={() => setSnap(true)} className="btn-secondary" title="Photograph your paper register to start registers with their balance"><Camera className="h-4 w-4" /> <span className="hidden sm:inline">Snap paper register</span></button>}
          {writable && staff && can.openRegister(staff.role) && <button onClick={() => setFromList(true)} className="btn-secondary"><ListChecks className="h-4 w-4" /> <span className="hidden sm:inline">From CD list</span></button>}
          {writable && staff && can.openRegister(staff.role) && <button onClick={() => setOpen(true)} className="btn-primary"><Plus className="h-4 w-4" /> New<span className="hidden sm:inline"> CD book</span></button>}
        </div>
      </div>

      {regs && regs.length > 0 && (
        <div className="relative mb-6 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className="input pl-9 pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a register — e.g. OxyContin, MST 30, fentanyl, Concerta" />
          {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Clear"><X className="h-4 w-4" /></button>}
        </div>
      )}
      {regs && regs.length > 0 && shown.length === 0 && <p className="text-muted-foreground">No register matches “{q}”.</p>}
      {regs === null && <p className="text-muted-foreground">Loading…</p>}
      {regs?.length === 0 && !ghosts.length && (
        <div className="card text-center">
          <p className="font-semibold">No registers yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Open a register for each controlled drug product you stock. Bring forward the balance from your paper book.</p>
        </div>
      )}

      {view === 'shelf' ? <Shelf regs={shelfItems as any} onStart={setStarting} onRemove={canOpen ? (r) => removeUnused(r as any) : undefined} /> : (
        <div className="space-y-8">
          {Object.entries(groups).map(([group, items]) => (
            <section key={group}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</h2>
              <TypeTable items={items} />
            </section>
          ))}
        </div>
      )}

      <Modal open={!!starting} onClose={() => setStarting(null)} title="Start a CD book">
        {starting && <StartFromList g={starting} onDone={() => { setStarting(null); load(); }} />}
      </Modal>
      <Modal open={snap} onClose={() => setSnap(false)} title="Snap your paper register" wide>
        <SnapPaperRegisters onChanged={load} />
      </Modal>
      <Modal open={fromList} onClose={() => setFromList(false)} title="Set up registers from the CD list" wide>
        <SetupFromList registers={regs ?? []} onDone={() => { setFromList(false); load(); }} />
      </Modal>
      <Modal open={open} onClose={() => setOpen(false)} title="New CD book">
        <NewRegisterForm registers={regs ?? []} onDone={() => { setOpen(false); load(); }} />
      </Modal>
    </div>
  );
}

function NewRegisterForm({ onDone, registers }: { onDone: () => void; registers: Reg[] }) {
  const [f, setF] = useState({ drug_name: '', brand: '', class_name: '', schedule: '2', schedule_paragraph: '', form: '', strength: '', unit: 'tablets', opening_balance: '', opening_balance_note: '', opening_date: '', stereoisomer_of_register_id: '' });
  const [reading, setReading] = useState(false);
  const [paper, setPaper] = useState<any>(null);

  async function readPage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setReading(true);
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((file) => fd.append('file', file));
      const res = await fetch('/api/scan/register-page', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not read the page');
      setPaper(d);
      const p = d.page, o = d.opening;
      const fmt = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
      setF((x) => ({
        ...x,
        drug_name: p.drug_name || x.drug_name,
        brand: p.brand || x.brand,
        class_name: p.drug_name ? p.drug_name.split(' ')[0] : x.class_name,
        schedule: p.likely_schedule ? String(p.likely_schedule) : x.schedule,
        form: p.form || x.form,
        strength: p.strength || x.strength,
        unit: p.unit || x.unit,
        opening_balance: o.balance != null ? String(o.balance) : '',
        opening_date: o.date || '',
        opening_balance_note: `Paper CD register${p.product_written ? ` (${p.product_written})` : ''}, last entry ${fmt(o.date)}`.replace(/, last entry $/, ''),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the page');
    } finally {
      setReading(false);
    }
  }
  const [stereo, setStereo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/registers', { method: 'POST', json: { ...f, class_name: f.class_name || f.drug_name.split(' ')[0], opening_balance: f.opening_balance || undefined, stereoisomer_of_register_id: stereo && f.stereoisomer_of_register_id ? f.stereoisomer_of_register_id : null } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open register');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label className={`sm:col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-brand/50 bg-brand/5 p-4 text-sm hover:bg-brand/10 ${reading ? 'pointer-events-none opacity-70' : ''}`}>
        {reading ? <Loader2 className="h-6 w-6 flex-shrink-0 animate-spin text-brand" /> : <Camera className="h-6 w-6 flex-shrink-0 text-brand" />}
        <span><b>{reading ? 'Reading the page…' : 'Snap the last page of your paper register'}</b><br /><span className="text-muted-foreground">Fills in the drug, balance brought forward and date. Sideways photos are fine. Names aren’t read.</span></span>
        <input type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={readPage} />
      </label>
      {paper && <PaperResult d={paper} chosen={f.opening_balance} onChoose={(n) => setF((x) => ({ ...x, opening_balance: String(n) }))} />}
      <div><label className="label">Brand</label><input className="input" value={f.brand} onChange={set('brand')} placeholder="e.g. OxyNorm" /></div>
      <div><label className="label">Drug (generic name)</label><input className="input" required value={f.drug_name} onChange={set('drug_name')} placeholder="e.g. Oxycodone hydrochloride" /></div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={stereo} onChange={(e) => setStereo(e.target.checked)} />
        <span>This is a <b>stereoisomer</b> of a drug already registered. It will be recorded in that drug&apos;s part of the register.</span>
      </label>
      {stereo ? (
        <div className="sm:col-span-2"><label className="label">Parent drug register</label>
          <select className="input" required value={f.stereoisomer_of_register_id} onChange={set('stereoisomer_of_register_id')}>
            <option value="">Choose…</option>
            {registers.filter((r) => !r.product.is_stereoisomer_of).map((r) => <option key={r.id} value={r.id}>{r.product.class_name} — {r.product.drug_name} {r.product.strength} {r.product.form}</option>)}
          </select>
        </div>
      ) : (
        <>
          <div><label className="label">Class of drug</label><input className="input" value={f.class_name} onChange={set('class_name')} placeholder="e.g. Oxycodone" /></div>
          <div><label className="label">Schedule</label><select className="input" value={f.schedule} onChange={set('schedule')}><option value="2">Schedule 2</option><option value="3">Schedule 3</option><option value="4">Schedule 4</option></select></div>
          {f.schedule === '2' && (
            <div className="sm:col-span-2"><label className="label">Schedule 2 paragraph</label>
              <select className="input" value={f.schedule_paragraph} onChange={set('schedule_paragraph')}>
                <option value="">Not specified</option>
                <option value="para 1">Paragraph 1 — listed drugs</option>
                <option value="para 3">Paragraph 3 — salts of paragraph 1 drugs</option>
                <option value="para 6">Paragraph 6 — preparations of paragraphs 1–5</option>
                <option value="other">Other paragraph</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Each paragraph gets its own part of the register.</p>
            </div>
          )}
        </>
      )}
      <div><label className="label">Form</label><input className="input" required value={f.form} onChange={set('form')} placeholder="e.g. capsule" /></div>
      <div><label className="label">Strength</label><input className="input" required value={f.strength} onChange={set('strength')} placeholder="e.g. 5mg" /></div>
      <div><label className="label">Counted in</label><select className="input" value={f.unit} onChange={set('unit')}>{['tablets', 'capsules', 'ml', 'patches', 'ampoules', 'vials', 'units'].map((u) => <option key={u}>{u}</option>)}</select></div>
      <div><label className="label">Balance brought forward</label><input className="input" type="number" min="0" step="any" inputMode="decimal" value={f.opening_balance} onChange={set('opening_balance')} placeholder="From paper register" /></div>
      <div><label className="label">Date of balance</label><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={f.opening_date} onChange={set('opening_date')} /></div>
      <div className="sm:col-span-2"><label className="label">Transferred from</label><input className="input" value={f.opening_balance_note} onChange={set('opening_balance_note')} placeholder="e.g. Paper register vol. 3, page 99" /></div>
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">{error}</p>}
      <button className="btn-primary sm:col-span-2" disabled={busy || (paper?.opening?.blocking && !f.opening_balance)}>Open register</button>
    </form>
  );
}

function PaperResult({ d, chosen, onChoose }: { d: any; chosen: string; onChoose: (n: number) => void }) {
  const o = d.opening;
  return (
    <div className={`space-y-2 rounded-xl border p-4 text-sm sm:col-span-2 ${o.blocking ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100' : 'border-brand/40 bg-brand/10'}`}>
      <p className="flex items-center gap-2 font-semibold">
        {o.blocking ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-brand" />}
        {d.page.product_written || 'Product not read'} · balance {o.label}{o.date ? ` · ${o.date.split('-').reverse().join('/')}` : ''}
      </p>
      <p className="text-xs opacity-80">Checked {o.rows_checked} line{o.rows_checked === 1 ? '' : 's'} on the page{d.page.balance_transferred != null ? `, from ${d.page.balance_transferred} brought forward` : ''}.</p>
      {o.options.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span>Count the stock, then choose:</span>
          {o.options.map((n: number, i: number) => (
            <button type="button" key={n} onClick={() => onChoose(n)} className={`rounded-lg border px-3 py-1.5 font-semibold ${chosen === String(n) ? 'border-brand bg-brand text-white' : 'border-current/30 bg-background'}`}>
              {n} <span className="font-normal opacity-75">{i === 0 ? '(as written)' : '(by the sum)'}</span>
            </button>
          ))}
        </div>
      )}
      {o.flags.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs">{o.flags.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>}
      {d.exempt && <p className="text-xs font-semibold">{d.exempt}</p>}
      {d.existing && (
        <p className="text-xs">You already have a register for {d.existing.label} (balance {d.existing.balance}). <Link href={`/dashboard/register/${d.existing.id}`} className="font-semibold underline">Open it</Link> instead — a second live register for the same product isn’t allowed.</p>
      )}
    </div>
  );
}

/** One table per drug type: every strength/form with its balance. */
function TypeTable({ items }: { items: Reg[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Form</th><th className="px-4 py-2.5 text-right">Balance</th><th className="hidden px-4 py-2.5 sm:table-cell">Last stock check</th><th className="px-4 py-2.5" /></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((r) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <td className="px-4 py-2.5 font-medium"><Link href={`/dashboard/register/${r.id}`} className="hover:underline">{brandOf(r.product) ?? r.product.drug_name} {r.product.strength}</Link>{genericLine(r.product) && <span className="block text-xs font-normal text-muted-foreground">{genericLine(r.product)}</span>}
                {r.low_stock && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-950">Low</span>}
                {r.check_due && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-secondary-foreground">Check due</span>}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{r.product.form}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.balance} <span className="font-normal text-muted-foreground">{r.product.unit}</span></td>
              <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{r.last_checked_at ? new Date(r.last_checked_at).toLocaleDateString('en-IE') : '—'}</td>
              <td className="px-2 py-2.5 text-right"><Link href={`/dashboard/register/${r.id}`} className="inline-flex rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Open register"><ChevronRight className="h-4 w-4" /></Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Start one CD book from the shelf: brand, balance brought forward and its date. */
function StartFromList({ g, onDone }: { g: Ghost; onDone: () => void }) {
  const [brand, setBrand] = useState(g.product.brands[0]);
  const [balance, setBalance] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/api/registers', { method: 'POST', json: {
        drug_name: g.product.generic, brand, class_name: g.product.class, schedule: 2, schedule_paragraph: g.product.para,
        form: g.product.form, strength: g.strength, unit: g.product.unit,
        opening_balance: balance ? Number(balance) : undefined, opening_date: date, opening_balance_note: 'Brought forward from paper CD register',
      } });
      onDone();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not start the book'); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={start} className="space-y-4">
      <p className="text-lg font-bold">{brand} {g.strength} <span className="font-normal text-muted-foreground">{g.product.form}</span></p>
      <p className="-mt-3 text-sm text-muted-foreground">{g.product.generic}</p>
      {g.product.brands.length > 1 && (
        <div><label className="label">Brand you stock</label>
          <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>{g.product.brands.map((b) => <option key={b}>{b}</option>)}</select></div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Balance brought forward ({g.product.unit})</label><input className="input font-semibold" type="number" min="0" step="any" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" autoFocus /></div>
        <div><label className="label">As at</label><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Start CD book</button>
    </form>
  );
}
