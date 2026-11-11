'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ScanLine, Users, Download } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { can } from '@/lib/roles';
import { useStaff } from '@/components/dashboard/staff-context';
import { Modal } from '@/components/modal';
import { canWrite } from '@/lib/stripe';

interface Reg {
  id: string;
  balance: number;
  product: { drug_name: string; schedule: number; schedule_paragraph: string | null; class_name: string; form: string; strength: string; unit: string; is_stereoisomer_of: string | null; parent: { drug_name: string } | null };
}

// The bookshelf: one "book" per drug/strength/form, grouped by class (FR4, FR8).
export default function RegistersPage() {
  const { staff, pharmacy } = useStaff();
  const writable = canWrite(pharmacy?.subscription_status);
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => api('/api/registers').then((d) => setRegs(d.registers)), []);
  useEffect(() => { load(); }, [load]);

  const groups = (regs ?? []).reduce<Record<string, Reg[]>>((acc, r) => {
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
        <div className="flex gap-2 whitespace-nowrap">
          <a href="/api/export" className="btn-secondary" title="Download every register as one file — keep a recent copy for business continuity"><Download className="h-4 w-4" /> <span className="hidden sm:inline">Export all</span></a>
          {staff && can.manageStaff(staff.role) && <Link href="/dashboard/team" className="btn-secondary lg:hidden"><Users className="h-4 w-4" /> Team</Link>}
          {writable && staff && can.scan(staff.role) && <Link href="/dashboard/scan" className="btn-brand"><ScanLine className="h-4 w-4" /> Scan<span className="hidden sm:inline"> invoice</span></Link>}
          {writable && staff && can.openRegister(staff.role) && <button onClick={() => setOpen(true)} className="btn-primary"><Plus className="h-4 w-4" /> New<span className="hidden sm:inline"> register</span></button>}
        </div>
      </div>

      {regs === null && <p className="text-muted-foreground">Loading…</p>}
      {regs?.length === 0 && (
        <div className="card text-center">
          <p className="font-semibold">No registers yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Open a register for each controlled drug product you stock. Bring forward the balance from your paper book.</p>
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(groups).map(([group, items]) => (
          <section key={group}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((r) => (
                <Link key={r.id} href={`/dashboard/register/${r.id}`} className="group relative overflow-hidden rounded-r-xl rounded-l-md bg-gradient-to-br from-brand-dark to-brand-deep p-4 pl-6 text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="absolute inset-y-0 left-0 w-2.5 bg-black/25" aria-hidden />
                  <span className="absolute inset-y-0 left-2.5 w-px bg-white/20" aria-hidden />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">Register of controlled drugs</p>
                  <p className="mt-2 text-lg font-bold leading-tight">{r.product.drug_name}</p>
                  <p className="text-sm text-white/80">{r.product.strength} · {r.product.form}</p>
                  {r.product.parent && <p className="mt-1 text-xs text-white/70">Stereoisomer of {r.product.parent.drug_name}</p>}
                  <div className="mt-4 flex items-end justify-between">
                    <span className="text-xs text-white/60">Balance</span>
                    <span className="text-2xl font-bold tabular-nums">{r.balance}<span className="ml-1 text-sm font-normal text-white/70">{r.product.unit}</span></span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Open a new register">
        <NewRegisterForm registers={regs ?? []} onDone={() => { setOpen(false); load(); }} />
      </Modal>
    </div>
  );
}

function NewRegisterForm({ onDone, registers }: { onDone: () => void; registers: Reg[] }) {
  const [f, setF] = useState({ drug_name: '', class_name: '', schedule: '2', schedule_paragraph: '', form: '', strength: '', unit: 'tablets', opening_balance: '', opening_balance_note: '', stereoisomer_of_register_id: '' });
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
      <div className="sm:col-span-2"><label className="label">Drug (generic name)</label><input className="input" required value={f.drug_name} onChange={set('drug_name')} placeholder="e.g. Oxycodone hydrochloride" /></div>
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
      <div className="sm:col-span-2"><label className="label">Transferred from</label><input className="input" value={f.opening_balance_note} onChange={set('opening_balance_note')} placeholder="e.g. Paper register vol. 3, page 99" /></div>
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">{error}</p>}
      <button className="btn-primary sm:col-span-2" disabled={busy}>Open register</button>
    </form>
  );
}
