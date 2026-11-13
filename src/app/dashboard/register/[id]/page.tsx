'use client';

import { productTitle, genericLine, brandOf } from '@/lib/product-name';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Plus, Printer, PencilLine, Trash2, Repeat, X } from 'lucide-react';
import { api } from '@/lib/api';
import { can } from '@/lib/roles';
import { canWrite } from '@/lib/stripe';
import { LogoMark } from '@/components/logo';
import { Modal } from '@/components/modal';
import { useStaff } from '@/components/dashboard/staff-context';
import { EntryForm, type EntryType } from '@/components/dashboard/entry-form';
import { StockCheckButton } from '@/components/dashboard/stock-check';
import { QuarantinePanel } from '@/components/dashboard/quarantine';
import { RepeatSupplies, type SupplyLine } from '@/components/dashboard/repeat-supplies';

const LINES_PER_PAGE = 16;

interface Raw {
  id: string; seq: number; entry_type: EntryType; transaction_date: string; recorded_at: string; quantity: string;
  supplier_name: string | null; supplier_address: string | null; recipient_name: string | null; recipient_address: string | null;
  prescriber_name: string | null; prescriber_address: string | null; authority_to_possess: string | null; prescription_ref: string | null;
  witness_name: string | null; witness_role: string | null; corrects_entry_id: string | null; correction_reason: string | null;
  recorded_by_staff_id: string; source: string; notes: string | null;
}
interface Ledger extends Raw { running_balance: string; correction_count: number }
interface Person { id: string; full_name: string; psi_number: string | null }

/** One printed line of the book. */
interface Line {
  key: string;
  raw: Raw;
  struck: boolean;
  balance: string | null;
  footnote: number | null;
  correctable: boolean;
}

const fmtDate = (d: string) => new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtQty = (q: string | number) => Number(q).toLocaleString('en-IE', { maximumFractionDigits: 3 });

function partyCell(r: Raw) {
  if (r.entry_type === 'receipt') return { name: r.supplier_name, address: r.supplier_address };
  if (r.entry_type === 'destruction') return { name: 'DESTROYED', address: `Witness: ${r.witness_name} (${r.witness_role})` };
  if (r.entry_type === 'patient_return') return { name: `Patient return — ${r.recipient_name}`, address: 'Not pharmacy stock' };
  if (r.entry_type === 'patient_return_destruction') return { name: 'PATIENT RETURN DESTROYED', address: `Witness: ${r.witness_name} (${r.witness_role})` };
  return { name: r.recipient_name, address: r.recipient_address };
}

function authorityCell(r: Raw) {
  if (r.entry_type === 'receipt') return r.notes ?? '';
  return [r.authority_to_possess || (r.prescriber_name ? `Rx — ${r.prescriber_name}` : ''), r.prescription_ref].filter(Boolean).join(' · ');
}

export default function RegisterBook({ params }: { params: { id: string } }) {
  const { staff, pharmacy } = useStaff();
  const [data, setData] = useState<{ register: any; ledger: Ledger[]; entries: Raw[]; staff: Person[] } | null>(null);
  const [opened, setOpened] = useState(false);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<EntryType | undefined>(undefined);
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('new') as EntryType | null;
    if (n && ['receipt', 'supply', 'destruction', 'patient_return'].includes(n)) {
      setAddType(n);
      setAdding(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  const [correcting, setCorrecting] = useState<Raw | null>(null);
  // Excel-style selection of supply lines → "Repeat for today" (typical repeat prescriptions).
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [repeating, setRepeating] = useState(false);

  const load = useCallback(async () => {
    const d = await api(`/api/registers/${params.id}`);
    setData(d);
    return d;
  }, [params.id]);

  useEffect(() => {
    load().then(() => setTimeout(() => setOpened(true), 700));
  }, [load]);

  // Build book lines: an original that was corrected is shown struck through (still
  // legible) followed by its correction(s); footnotes explain who/when/why (FR11, NFR5).
  const { lines, footnotes, balance } = useMemo(() => {
    if (!data) return { lines: [] as Line[], footnotes: [] as { n: number; text: string }[], balance: 0 };
    const ledgerById = new Map(data.ledger.map((l) => [l.id, l]));
    const correctionsFor = new Map<string, Raw[]>();
    for (const e of data.entries) if (e.entry_type === 'correction' && e.corrects_entry_id) {
      const arr = correctionsFor.get(e.corrects_entry_id) ?? [];
      arr.push(e);
      correctionsFor.set(e.corrects_entry_id, arr);
    }
    const people = new Map(data.staff.map((p) => [p.id, p]));
    const out: Line[] = [];
    const notes: { n: number; text: string }[] = [];
    for (const e of data.entries) {
      if (e.entry_type === 'correction') continue;
      const led = ledgerById.get(e.id);
      const corrs = correctionsFor.get(e.id) ?? [];
      if (!corrs.length) {
        out.push({ key: e.id, raw: e, struck: false, balance: led?.running_balance ?? null, footnote: null, correctable: true });
        continue;
      }
      out.push({ key: e.id, raw: e, struck: true, balance: null, footnote: null, correctable: false });
      corrs.forEach((c, i) => {
        const last = i === corrs.length - 1;
        const n = notes.length + 1;
        const who = people.get(c.recorded_by_staff_id);
        const prev = i === 0 ? e : corrs[i - 1];
        notes.push({
          n,
          text: `Line ${e.seq} corrected ${new Date(c.recorded_at).toLocaleString('en-IE', { dateStyle: 'short', timeStyle: 'short' })} by ${who?.full_name ?? 'unknown'}${who?.psi_number ? ` (PSI ${who.psi_number})` : ''}. Amount ${fmtQty(prev.quantity)} → ${fmtQty(c.quantity)}. Reason: ${c.correction_reason}`,
        });
        // A correction row carries the corrected values plus the original's type.
        out.push({ key: c.id, raw: { ...c, entry_type: e.entry_type }, struck: !last, balance: last ? led?.running_balance ?? null : null, footnote: n, correctable: false });
      });
      // Allow a further correction of the original via its latest version.
      out[out.length - 1].correctable = true;
      out[out.length - 1].raw = { ...out[out.length - 1].raw, id: e.id, seq: e.seq };
    }
    const bal = data.ledger.length ? Number(data.ledger[data.ledger.length - 1].running_balance) : 0;
    return { lines: out, footnotes: notes, balance: bal };
  }, [data]);

  const pages = Math.max(1, Math.ceil(lines.length / LINES_PER_PAGE));
  useEffect(() => setPage(pages - 1), [pages]); // open at the current page, like the paper book
  const pageLines = lines.slice(page * LINES_PER_PAGE, (page + 1) * LINES_PER_PAGE);
  const pageNotes = footnotes.filter((f) => pageLines.some((l) => l.footnote === f.n));
  const people = new Map((data?.staff ?? []).map((p) => [p.id, p]));

  if (!data) return <p className="text-muted-foreground">Opening register…</p>;
  const p = data.register.product;
  const mayRecord = staff && can.record(staff.role) && canWrite(pharmacy?.subscription_status);
  const selectable = (l: Line) => !!mayRecord && !l.struck && l.raw.entry_type === 'supply';
  const pickable = lines.filter(selectable);
  const choose = (l: Line, e: React.MouseEvent) => {
    if (!selectable(l) || (e.target as HTMLElement).closest('button,a,input')) return;
    if (e.shiftKey && anchor) {
      const keys = pickable.map((x) => x.key);
      const [a, b] = [keys.indexOf(anchor), keys.indexOf(l.key)].sort((x, y) => x - y);
      if (a >= 0 && b >= 0) { setSelected((cur) => [...new Set([...cur, ...keys.slice(a, b + 1)])]); return; }
    }
    setSelected((cur) => (cur.includes(l.key) ? cur.filter((k) => k !== l.key) : [...cur, l.key]));
    setAnchor(l.key);
  };
  const chosenLines: SupplyLine[] = lines.filter((l) => selected.includes(l.key)).map((l) => ({ ...(l.raw as any), id: l.raw.corrects_entry_id ?? l.raw.id }));

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="btn-ghost -ml-3"><ArrowLeft className="h-4 w-4" /> All registers</Link>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/registers/${params.id}/export`} className="btn-secondary"><Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span> CSV</a>
          <button onClick={() => window.print()} className="btn-secondary"><Printer className="h-4 w-4" /> Print</button>
          {data.entries.length === 0 && staff && can.openRegister(staff.role) && (
            <button onClick={async () => {
              if (!confirm('Remove this unused CD book? It has no entries.')) return;
              try { await api(`/api/registers/${params.id}`, { method: 'DELETE' }); window.location.href = '/dashboard'; }
              catch (e: any) { alert(e?.message ?? 'Could not remove it'); }
            }} className="btn-ghost text-destructive"><Trash2 className="h-4 w-4" /> Remove book</button>
          )}
          <StockCheckButton registerId={params.id} unit={p.unit} balance={Number(balance)} canRecord={!!mayRecord} />
          <QuarantinePanel registerId={params.id} unit={p.unit} balance={Number(balance)} canRecord={!!mayRecord} onChanged={load} />
          {mayRecord && <button onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> New entry</button>}
        </div>
      </div>

      <div className="book-stage">
        <div className={`book ${opened ? 'open' : ''}`}>
          {/* Cover */}
          <div className="book-cover no-print flex overflow-hidden bg-white" aria-hidden={opened}>
            <div className="flex flex-1 flex-col justify-center px-8 sm:px-14">
              <p className="text-2xl font-extrabold uppercase tracking-wide text-brand-dark sm:text-3xl">Register of Controlled Drugs</p>
              <p className="mt-2 text-base text-slate-600 sm:text-lg">for recording the obtaining and supplying of controlled drugs</p>
              <p className="mt-6 text-lg font-bold text-slate-700">{productTitle(p)}</p>
              {genericLine(p) && <p className="text-sm text-slate-500">{p.class_name} — {genericLine(p)}</p>}
            </div>
            <div className="relative hidden w-[38%] items-end justify-end bg-gradient-to-b from-brand-dark to-brand-deep p-6 sm:flex">
              <span className="absolute inset-y-0 left-0 w-4 bg-brand/60" />
              <div className="flex items-center gap-2 text-white"><LogoMark size={30} /><span className="text-sm font-semibold">PharmacyCDReg.ie</span></div>
            </div>
          </div>

          {/* Pages */}
          <div className="book-pages">
            <article key={page} className="print-page page-turn overflow-hidden rounded-lg bg-[rgb(var(--paper))] shadow-[0_20px_40px_-20px_rgba(0,0,0,.35)] ring-1 ring-border">
              <div className="flex">
                <div className="hidden w-3 flex-shrink-0 bg-gradient-to-r from-slate-300/70 to-transparent dark:from-black/40 sm:block" aria-hidden />
                <div className="min-w-0 flex-1 p-4 sm:p-6">
                  <header className="mb-4 grid gap-1 text-[rgb(var(--ink))]">
                    <p className="text-sm font-bold uppercase sm:text-base">Class of drug (drug name): <span className="font-semibold normal-case underline decoration-dotted underline-offset-4">{p.class_name}</span></p>
                    <p className="text-sm font-bold uppercase sm:text-base">Product: <span className="text-lg font-extrabold normal-case underline decoration-dotted underline-offset-4 sm:text-xl">{productTitle(p)}</span>{genericLine(p) && <span className="ml-2 text-xs font-medium normal-case text-muted-foreground">({genericLine(p)})</span>}</p>
                    <p className="text-xs text-muted-foreground">Schedule {p.schedule}{p.schedule_paragraph ? ` (${p.schedule_paragraph})` : ''}{p.parent ? ` · stereoisomer of ${p.parent.drug_name}, recorded in its part of the register` : ''} · counted in {p.unit} · current balance <b className="text-[rgb(var(--ink))]">{fmtQty(balance)} {p.unit}</b></p>
                  </header>

                  <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                    <table className="register-table min-w-[860px]">
                      <thead>
                        <tr>
                          <th rowSpan={2} className="w-[78px]">Date<small>on which supply received or transaction effected</small></th>
                          <th rowSpan={2}>Name and address of person from whom obtained <small>(e.g. wholesaler)</small> or to whom supplied <small>(e.g. patient)</small></th>
                          <th rowSpan={2} className="w-[190px]">Authority of person supplied to be in possession<small>(prescription / requisition reference, prescriber&apos;s name, reference number)</small></th>
                          <th colSpan={2}>Amount</th>
                          <th rowSpan={2} className="w-[86px]">Stock balance</th>
                          <th rowSpan={2} className="w-[130px]">Pharmacist<small>(registration number)</small></th>
                          {mayRecord && <th rowSpan={2} className="no-print w-[40px]"><span className="sr-only">Correct</span></th>}
                        </tr>
                        <tr><th className="w-[70px]">Obtained</th><th className="w-[70px]">Supplied</th></tr>
                      </thead>
                      <tbody>
                        {pageLines.map((l) => {
                          const r = l.raw;
                          const party = partyCell(r);
                          const who = people.get(r.recorded_by_staff_id);
                          const inQty = r.entry_type === 'receipt' ? fmtQty(r.quantity) : '';
                          const outQty = ['supply', 'destruction', 'patient_return_destruction'].includes(r.entry_type) ? fmtQty(r.quantity) : '';
                          const cls = l.struck ? 'struck' : '';
                          return (
                            <tr key={l.key} onClick={(e) => choose(l, e)} aria-selected={selected.includes(l.key) || undefined}
                              title={selectable(l) ? 'Click to select · Shift-click for a range · then “Repeat for today”' : undefined}
                              className={`${selectable(l) ? 'cursor-pointer select-none' : ''} ${selected.includes(l.key) ? 'bg-brand/15 outline outline-2 -outline-offset-2 outline-brand' : r.entry_type.includes('patient_return') ? 'bg-sky-50/60 dark:bg-sky-950/30' : r.entry_type === 'destruction' ? 'bg-amber-50/60 dark:bg-amber-950/20' : selectable(l) ? 'hover:bg-brand/5' : ''}`}>
                              <td className={`${cls} tabular-nums`}>{fmtDate(r.transaction_date)}</td>
                              <td className={cls}>
                                <span className="font-medium">{party.name}</span>
                                {party.address && <span className="block text-xs opacity-75">{party.address}</span>}
                                {l.footnote && <sup className="ml-1 font-bold text-red-600">{l.footnote}</sup>}
                                {r.source === 'scan' && !l.struck && <span className="badge ml-1 bg-brand/15 text-[10px] text-primary no-print">scanned</span>}
                              </td>
                              <td className={`${cls} text-xs`}>{authorityCell(r)}</td>
                              <td className={`${cls} text-right font-semibold tabular-nums`}>{inQty}</td>
                              <td className={`${cls} text-right font-semibold tabular-nums`}>{outQty}</td>
                              <td className="text-right font-bold tabular-nums">{l.balance !== null ? fmtQty(l.balance) : ''}</td>
                              <td className={`${cls} text-xs`}>{who?.full_name}{who?.psi_number && <span className="block opacity-70">PSI {who.psi_number}</span>}</td>
                              {mayRecord && (
                                <td className="no-print text-center">
                                  {l.correctable && (
                                    <button onClick={() => setCorrecting({ ...r, id: r.corrects_entry_id ?? r.id })} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={`Correct line ${r.seq}`} aria-label={`Correct line ${r.seq}`}>
                                      <PencilLine className="h-4 w-4" />
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                        {/* Ruled empty lines so the page looks like the book */}
                        {Array.from({ length: Math.max(0, LINES_PER_PAGE - pageLines.length) }).map((_, i) => (
                          <tr key={`empty-${i}`} aria-hidden={!mayRecord}
                            onClick={mayRecord ? () => { setAddType(undefined); setAdding(true); } : undefined}
                            className={mayRecord ? 'group cursor-pointer hover:bg-brand/5' : undefined}
                            title={mayRecord ? 'Add the next entry' : undefined}>
                            <td />
                            <td>{mayRecord && <span className={`no-print text-sm font-semibold text-primary ${i === 0 ? 'opacity-70' : 'opacity-0'} group-hover:opacity-100`}>+ {i === 0 ? 'Add the next entry here' : 'Add entry'}</span>}</td>
                            <td /><td /><td /><td /><td />{mayRecord && <td className="no-print" />}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 grid gap-3 text-[rgb(var(--ink))] sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-xs font-bold uppercase">Footnotes:</p>
                      <div className="mt-1 min-h-[44px] rounded border border-[rgb(var(--rule)/.7)] p-2 text-xs leading-relaxed">
                        {pageNotes.length ? pageNotes.map((f) => <p key={f.n}><b className="text-red-600">{f.n}</b> {f.text}</p>) : <span className="text-muted-foreground">—</span>}
                      </div>
                    </div>
                  </div>

                  <footer className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Continued from page <b className="inline-block min-w-[28px] rounded border border-[rgb(var(--rule))] px-1 text-center text-[rgb(var(--ink))]">{page > 0 ? page : '—'}</b></span>
                    <span className="font-bold tracking-widest text-[rgb(var(--ink))]">PAGE {page + 1}</span>
                    <span>Continued on page <b className="inline-block min-w-[28px] rounded border border-[rgb(var(--rule))] px-1 text-center text-[rgb(var(--ink))]">{page < pages - 1 ? page + 2 : '—'}</b></span>
                  </footer>
                </div>
              </div>
            </article>

            <div className="no-print mt-4 flex items-center justify-center gap-3">
              <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((x) => x - 1)} aria-label="Previous page"><ChevronLeft className="h-5 w-5" /></button>
              <span className="text-sm tabular-nums text-muted-foreground">Page {page + 1} of {pages}</span>
              <button className="btn-secondary" disabled={page >= pages - 1} onClick={() => setPage((x) => x + 1)} aria-label="Next page"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile floating add button */}
      {mayRecord && (
        <button onClick={() => setAdding(true)} className="no-print fixed bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl lg:hidden" aria-label="New entry">
          <Plus className="h-7 w-7" />
        </button>
      )}

      {selected.length > 0 && !repeating && (
        <div className="no-print fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 lg:bottom-6">
          <div className="flex items-center gap-2 rounded-full bg-foreground px-3 py-2 text-sm text-background shadow-2xl">
            <span className="px-2 font-semibold">{selected.length} selected</span>
            <button onClick={() => setRepeating(true)} className="flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 font-semibold text-white"><Repeat className="h-4 w-4" /> Repeat for today</button>
            <button onClick={() => setSelected([])} className="rounded-full p-1.5 hover:bg-background/20" aria-label="Clear selection"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      <Modal open={repeating} onClose={() => setRepeating(false)} title={`Repeat ${selected.length > 1 ? `${selected.length} supplies` : 'supply'} — ${brandOf(p) ?? p.drug_name} ${p.strength}`} wide>
        {repeating && <RepeatSupplies registerId={params.id} unit={p.unit} balance={Number(balance)} lines={chosenLines}
          onCancel={() => setRepeating(false)} onDone={async () => { setRepeating(false); setSelected([]); await load(); }} />}
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title={`New entry — ${brandOf(p) ?? p.drug_name} ${p.strength}`}>
        <EntryForm registerId={params.id} unit={p.unit} balance={balance} initial={addType ? { entry_type: addType } : undefined} onCancel={() => setAdding(false)} onSaved={async () => { setAdding(false); await load(); }} />
      </Modal>
      <Modal open={!!correcting} onClose={() => setCorrecting(null)} title="Correct a register entry">
        {correcting && (
          <EntryForm
            registerId={params.id}
            unit={p.unit}
            balance={balance}
            correcting={{ id: correcting.id, seq: correcting.seq, entry_type: correcting.entry_type }}
            initial={{ ...correcting, corrects_entry_id: undefined, correction_reason: undefined, quantity: correcting.quantity, notes: correcting.notes }}
            onCancel={() => setCorrecting(null)}
            onSaved={async () => { setCorrecting(null); await load(); }}
          />
        )}
      </Modal>
    </div>
  );
}
