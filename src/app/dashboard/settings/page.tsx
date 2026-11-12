'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, ShieldCheck, ClipboardCheck, Database, Loader2, Check, Download, Users, BookUser, CreditCard, Plug, ChevronRight, Archive } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStaff } from '@/components/dashboard/staff-context';
import { can } from '@/lib/roles';
import { TwoStepSettings } from '@/components/dashboard/two-step';

interface Settings { name: string; address: string; psi_premises_number: string | null; invoice_names: string | null; lock_minutes: number; locum_default_days: number; stock_check_frequency: string; halo_enabled: boolean; migrated: boolean }
interface Reg { id: string; label: string; unit: string; balance: number; low_stock_level: number | null }

function Section({ icon: Icon, title, text, children }: { icon: any; title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
        <div><h2 className="font-semibold">{title}</h2>{text && <p className="text-sm text-muted-foreground">{text}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function SaveBar({ busy, saved, error }: { busy: boolean; saved: boolean; error: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
      {saved && <span className="flex items-center gap-1 text-sm text-brand"><Check className="h-4 w-4" /> Saved</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

function useSaver(onSaved: (s: Settings) => void) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (json: Record<string, unknown>) => {
    setBusy(true); setSaved(false); setError(null);
    try { const d = await api('/api/settings', { method: 'PATCH', json }); onSaved(d.settings); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  return { busy, saved, error, save };
}

export default function SettingsPage() {
  const { staff, refresh } = useStaff();
  const [s, setS] = useState<Settings | null>(null);
  const [regs, setRegs] = useState<Reg[]>([]);
  const load = useCallback(() => api('/api/settings').then((d) => { setS(d.settings); setRegs(d.registers); }), []);
  useEffect(() => { load(); }, [load]);

  if (!staff || !can.manageStaff(staff.role)) return <p className="text-muted-foreground">Only the supervising pharmacist can change settings.</p>;
  if (!s) return <p className="text-muted-foreground">Loading…</p>;
  const onSaved = (x: Settings) => { setS(x); refresh(); };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Changes are recorded in the audit trail.</p>
      </div>
      {!s.migrated && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Some settings need a one-off database update. In Supabase → SQL Editor, run <code>supabase/migrations/0007_settings_stock_checks.sql</code>.
        </p>
      )}

      <PharmacyDetails s={s} onSaved={onSaved} />
      <Security s={s} onSaved={onSaved} />
      <StockChecks s={s} regs={regs} onSaved={(x) => { onSaved(x); load(); }} />
      <Data regs={regs} reload={load} />

      <section className="card divide-y divide-border p-0">
        {[
          { href: '/dashboard/team', icon: Users, label: 'Team & PINs', text: 'Staff, locums and their roles' },
          { href: '/dashboard/contacts', icon: BookUser, label: 'Doctors & suppliers', text: 'Quick-fill lists, GMS GPs' },
          { href: '/dashboard/billing', icon: CreditCard, label: 'Billing', text: 'Plan and payment' },
          ...(s.halo_enabled ? [{ href: '/dashboard/integrations', icon: Plug, label: 'Halo connection', text: 'Dispensing link and keys' }] : []),
        ].map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 px-5 py-4 hover:bg-muted/50">
            <l.icon className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1"><span className="block font-medium">{l.label}</span><span className="block text-sm text-muted-foreground">{l.text}</span></span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </section>
    </div>
  );
}

function PharmacyDetails({ s, onSaved }: { s: Settings; onSaved: (s: Settings) => void }) {
  const [f, setF] = useState({ name: s.name, address: s.address, psi_premises_number: s.psi_premises_number ?? '', invoice_names: s.invoice_names ?? '' });
  const { busy, saved, error, save } = useSaver(onSaved);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Section icon={Building2} title="Pharmacy details" text="Printed on every register page and export.">
      <form onSubmit={(e) => { e.preventDefault(); save({ ...f, psi_premises_number: f.psi_premises_number || null, invoice_names: f.invoice_names || null }); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Pharmacy name</label><input className="input" required value={f.name} onChange={set('name')} /></div>
          <div><label className="label">PSI pharmacy registration no.</label><input className="input" inputMode="numeric" value={f.psi_premises_number} onChange={set('psi_premises_number')} /></div>
        </div>
        <div><label className="label">Address</label><input className="input" required value={f.address} onChange={set('address')} /></div>
        <div><label className="label">Company name on invoices</label><input className="input" value={f.invoice_names} onChange={set('invoice_names')} placeholder="e.g. Bibola Ltd" />
          <p className="mt-1 text-xs text-muted-foreground">If wholesalers invoice a company name, scanning will know that’s you, not the supplier. Separate several with commas.</p></div>
        <SaveBar busy={busy} saved={saved} error={error} />
      </form>
    </Section>
  );
}

function Security({ s, onSaved }: { s: Settings; onSaved: (s: Settings) => void }) {
  const [f, setF] = useState({ lock_minutes: String(s.lock_minutes), locum_default_days: String(s.locum_default_days) });
  const { busy, saved, error, save } = useSaver(onSaved);
  return (
    <Section icon={ShieldCheck} title="Security" text="The pharmacy login opens the system; each person signs entries with their own PIN.">
      <form onSubmit={(e) => { e.preventDefault(); save({ lock_minutes: Number(f.lock_minutes), locum_default_days: Number(f.locum_default_days) }); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Lock the screen after</label>
            <select className="input" value={f.lock_minutes} onChange={(e) => setF({ ...f, lock_minutes: e.target.value })}>
              {[2, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes without use</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Staff re-enter their PIN. Takes effect at the next PIN entry.</p></div>
          <div><label className="label">Locum access lasts</label>
            <select className="input" value={f.locum_default_days} onChange={(e) => setF({ ...f, locum_default_days: e.target.value })}>
              {[1, 3, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'} by default</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Used when you add a locum pharmacist; you can change it per person.</p></div>
        </div>
        <SaveBar busy={busy} saved={saved} error={error} />
      </form>
      <div className="border-t border-border pt-4"><TwoStepSettings /></div>
    </Section>
  );
}

function StockChecks({ s, regs, onSaved }: { s: Settings; regs: Reg[]; onSaved: (s: Settings) => void }) {
  const [freq, setFreq] = useState(s.stock_check_frequency);
  const [levels, setLevels] = useState<Record<string, string>>(Object.fromEntries(regs.map((r) => [r.id, r.low_stock_level == null ? '' : String(r.low_stock_level)])));
  useEffect(() => { setLevels(Object.fromEntries(regs.map((r) => [r.id, r.low_stock_level == null ? '' : String(r.low_stock_level)]))); }, [regs]);
  const { busy, saved, error, save } = useSaver(onSaved);
  return (
    <Section icon={ClipboardCheck} title="Stock checks" text="Count the stock against the running balance. Each check is signed and kept — useful at inspection.">
      <form onSubmit={(e) => { e.preventDefault(); save({ stock_check_frequency: freq, low_stock: regs.map((r) => ({ register_id: r.id, level: levels[r.id] === '' ? null : Number(levels[r.id]) })) }); }} className="space-y-4">
        <div><label className="label">Remind us to check each register</label>
          <select className="input sm:max-w-xs" value={freq} onChange={(e) => setFreq(e.target.value)}>
            <option value="weekly">Every week</option><option value="fortnightly">Every 2 weeks</option><option value="monthly">Every month</option><option value="off">Don’t remind</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">Registers show “Stock check due” when it’s time. Record a check from the register’s <b>Stock check</b> button.</p></div>
        {regs.length > 0 && (
          <div>
            <label className="label">Low-stock warning (optional)</label>
            <div className="divide-y divide-border rounded-lg border border-border">
              {regs.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block truncate">{r.label}</span><span className="text-xs text-muted-foreground">Now {r.balance} {r.unit}</span></span>
                  <span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">at or below</span><input className="input w-24 py-1.5" type="number" min="0" step="any" inputMode="decimal" value={levels[r.id] ?? ''} onChange={(e) => setLevels({ ...levels, [r.id]: e.target.value })} placeholder="—" /></span>
                </div>
              ))}
            </div>
          </div>
        )}
        <SaveBar busy={busy} saved={saved} error={error} />
      </form>
    </Section>
  );
}

function Data({ regs, reload }: { regs: Reg[]; reload: () => void }) {
  const [closing, setClosing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const close = async (r: Reg) => {
    if (!confirm(`Close the register for ${r.label}? It stays readable and exportable, but no new entries can be made.`)) return;
    setClosing(r.id); setMsg(null);
    try { await api(`/api/registers/${r.id}/close`, { method: 'POST' }); setMsg(`Closed ${r.label}.`); reload(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not close'); }
    finally { setClosing(null); }
  };
  const empty = regs.filter((r) => r.balance === 0);
  return (
    <Section icon={Database} title="Data" text="Your registers are never deleted. Keep a recent copy for business continuity.">
      <a href="/api/export" className="btn-secondary w-fit"><Download className="h-4 w-4" /> Export every register (CSV)</a>
      <div>
        <p className="label">Close a register</p>
        <p className="mb-2 text-xs text-muted-foreground">For a product you no longer stock. Only registers at a nil balance can be closed.</p>
        {empty.length === 0 ? <p className="text-sm text-muted-foreground">No registers at nil balance.</p> : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {empty.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{r.label}</span>
                <button onClick={() => close(r)} disabled={closing === r.id} className="btn-ghost text-sm">{closing === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Close</button>
              </div>
            ))}
          </div>
        )}
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </div>
    </Section>
  );
}
