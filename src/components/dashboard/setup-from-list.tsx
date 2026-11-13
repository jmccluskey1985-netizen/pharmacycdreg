'use client';

import { useMemo, useState } from 'react';
import { Search, Loader2, Check } from 'lucide-react';
import { CD_PRODUCTS, searchCdProducts, normBrand, type CdProduct } from '@/data/cd-products';
import { brandOf } from '@/lib/product-name';
import { genericKey, sameStrength } from '@/lib/cd-catalogue';
import { api, ApiError } from '@/lib/api';

interface Existing { product: { drug_name: string; strength: string; form: string; brand?: string | null } }
type Pick = { product: CdProduct; strength: string; balance: string; brand: string };

const sameForm = (a: string, b: string) => a.toLowerCase().replace(/s$/, '') === b.toLowerCase().replace(/s$/, '');
// Same drug, strength, form AND brand (each brand has its own register).
export const isOpen = (regs: Existing[], p: CdProduct, strength: string) =>
  regs.some((r) => genericKey(r.product.drug_name) === genericKey(p.generic) && sameStrength(r.product.strength, strength) && sameForm(r.product.form, p.form)
    && (normBrand(brandOf(r.product))?.toLowerCase() ?? '') === (p.brands[0]?.toLowerCase() ?? ''));

/** Tick the CD products you stock (by strength), add opening balances, open them all at once. */
export function SetupFromList({ registers, onDone }: { registers: Existing[]; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const shown = useMemo(() => searchCdProducts(q), [q]);
  const byClass = shown.reduce<Record<string, CdProduct[]>>((a, x) => ((a[x.class] ||= []).push(x), a), {});
  const id = (p: CdProduct, s: string) => `${p.key}|${s}`;
  const toggle = (p: CdProduct, s: string) => setPicks((x) => {
    const k = id(p, s);
    const next = { ...x };
    if (next[k]) delete next[k]; else next[k] = { product: p, strength: s, balance: '', brand: p.brands[0] ?? '' };
    return next;
  });
  const list = Object.entries(picks);

  async function open() {
    setBusy(true); setMsg(null);
    let ok = 0;
    const failed: string[] = [];
    for (const [, x] of list) {
      try {
        await api('/api/registers', { method: 'POST', json: {
          drug_name: x.product.generic, brand: x.brand || null, class_name: x.product.class, schedule: 2, schedule_paragraph: x.product.para,
          form: x.product.form, strength: x.strength, unit: x.product.unit,
          opening_balance: x.balance ? Number(x.balance) : undefined, opening_date: date,
          opening_balance_note: 'Brought forward from paper CD register',
        } });
        ok++;
      } catch (e) {
        failed.push(`${x.brand || x.product.generic} ${x.strength}: ${e instanceof ApiError ? e.message : 'failed'}`);
      }
    }
    setBusy(false);
    if (!failed.length) { onDone(); return; }
    setMsg(`Opened ${ok}. Not opened: ${failed.join('; ')}`);
  }

  return (
    <div className="space-y-4">
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus className="input pl-9" placeholder="Search, e.g. OxyContin, MST, fentanyl, Concerta" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="max-h-[45vh] space-y-4 overflow-y-auto pr-1">
        {Object.entries(byClass).map(([cls, items]) => (
          <div key={cls}>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{cls}</p>
            <div className="space-y-2">
              {items.map((p) => (
                <div key={p.key} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold">{p.brands[0] ?? p.generic} <span className="font-normal text-muted-foreground">· {p.form}</span></p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.strengths.map((s) => {
                      const already = isOpen(registers, p, s);
                      const on = !!picks[id(p, s)];
                      return (
                        <button key={s} type="button" disabled={already} onClick={() => toggle(p, s)}
                          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${already ? 'border-transparent bg-muted text-muted-foreground' : on ? 'border-brand bg-brand text-white' : 'border-border hover:border-brand'}`}
                          title={already ? 'Register already open' : undefined}>
                          {(already || on) && <Check className="h-3 w-3" />} {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="text-sm text-muted-foreground">Not in the list: use “New register” to add it by hand.</p>}
      </div>

      {list.length > 0 && (
        <div className="space-y-2 rounded-xl border border-brand/40 bg-brand/5 p-3">
          <p className="text-sm font-semibold">{list.length} to open: balance brought forward from your paper book (leave blank for nil)</p>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {list.map(([k, x]) => (
              <div key={k} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <input className="input w-28 py-1 text-sm font-semibold" list={`brands-${k}`} value={x.brand} onChange={(e) => setPicks({ ...picks, [k]: { ...x, brand: e.target.value } })} aria-label="Brand" title="Pick or type any brand, e.g. Rowex" />
                  <datalist id={`brands-${k}`}>{x.product.brands.map((b) => <option key={b} value={b} />)}</datalist>
                  <span className="truncate">{x.strength} <span className="text-muted-foreground">{x.product.form}</span></span>
                </span>
                <input className="input w-28 py-1.5" type="number" min="0" step="any" inputMode="decimal" placeholder={`0 ${x.product.unit}`} value={x.balance} onChange={(e) => setPicks({ ...picks, [k]: { ...x, balance: e.target.value } })} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm"><span>Balance as at</span><input type="date" className="input w-auto py-1.5" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {msg && <p className="text-sm text-destructive">{msg}</p>}
          <button onClick={open} disabled={busy} className="btn-primary w-full">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Open {list.length} register{list.length === 1 ? '' : 's'}</button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Common Schedule 2 products in Ireland ({CD_PRODUCTS.length} products). Schedule 5 preparations such as Oramorph 10mg/5ml don’t need a register and aren’t listed.</p>
    </div>
  );
}
