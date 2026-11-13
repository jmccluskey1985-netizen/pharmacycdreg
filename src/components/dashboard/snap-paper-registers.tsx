'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, ImagePlus, Loader2, AlertTriangle, CheckCircle2, BookOpen, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { compressImage } from '@/lib/compress-image';
import { productFor } from '@/data/cd-products';

type Status = 'reading' | 'ready' | 'error' | 'opening' | 'opened';
interface Item {
  key: string; thumb: string; status: Status; error?: string;
  result?: any; // /api/scan/register-page response
  f: { drug_name: string; form: string; strength: string; unit: string; balance: string; date: string };
  registerId?: string;
}
const UNITS = ['tablets', 'capsules', 'ml', 'patches', 'ampoules', 'vials', 'units'];
const fmt = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * Snap the latest page of each drug in the paper CD register (one photo per drug). Each is
 * read separately and becomes a new, blank register carrying only the balance brought
 * forward and its date. The pharmacist checks every card before it's opened.
 */
export function SnapPaperRegisters({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const update = (key: string, patch: Partial<Item> | ((i: Item) => Partial<Item>)) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x)));

  async function add(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, 20);
    const fresh: Item[] = files.map((f, i) => ({ key: `${Date.now()}-${i}`, thumb: f.type.startsWith('image/') ? URL.createObjectURL(f) : '', status: 'reading', f: { drug_name: '', form: '', strength: '', unit: 'tablets', balance: '', date: '' } }));
    setItems((xs) => [...fresh, ...xs]);
    // One page = one drug: read them one after another so the reader isn't flooded.
    for (let i = 0; i < files.length; i++) {
      const it = fresh[i];
      try {
        const fd = new FormData();
        fd.append('file', await compressImage(files[i], files[i].name || 'page.jpg'));
        const res = await fetch('/api/scan/register-page', { method: 'POST', body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Could not read the page');
        const p = d.page, o = d.opening;
        update(it.key, {
          status: 'ready', result: d,
          f: { drug_name: p.drug_name ?? '', form: p.form ?? '', strength: p.strength ?? '', unit: p.unit ?? 'tablets', balance: o.balance != null ? String(o.balance) : '', date: o.date && o.date <= new Date().toISOString().slice(0, 10) ? o.date : '' },
        });
      } catch (e) {
        update(it.key, { status: 'error', error: e instanceof Error ? e.message : 'Could not read the page' });
      }
    }
  }

  async function open(it: Item) {
    const p = it.result?.page;
    const cat = productFor(it.f.drug_name, it.f.form, it.result?.page?.brand);
    update(it.key, { status: 'opening', error: undefined });
    try {
      const d = await api('/api/registers', { method: 'POST', json: {
        drug_name: it.f.drug_name, brand: p?.brand ?? cat?.brands[0] ?? null, class_name: cat?.class ?? it.f.drug_name.split(' ')[0], schedule: p?.likely_schedule ?? 2, schedule_paragraph: cat?.para ?? null,
        form: it.f.form, strength: it.f.strength, unit: it.f.unit,
        opening_balance: it.f.balance ? Number(it.f.balance) : undefined, opening_date: it.f.date || undefined,
        opening_balance_note: `Paper CD register${p?.product_written ? ` (${p.product_written})` : ''}${it.f.date ? `, last entry ${fmt(it.f.date)}` : ''}`,
      } });
      update(it.key, { status: 'opened', registerId: d.id });
      onChanged();
    } catch (e) {
      update(it.key, { status: 'ready', error: e instanceof ApiError ? e.message : 'Could not open the register' });
    }
  }

  const canOpen = (it: Item) => it.status === 'ready' && !it.result?.existing && !it.result?.exempt && it.f.drug_name && it.f.form && it.f.strength && it.f.balance !== '';
  const ready = items.filter(canOpen);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Photograph the <b>latest page</b> of each drug in your paper register — one photo per drug. Each becomes a new register, blank apart from the balance brought forward and its date. Sideways photos are fine; names aren’t read.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => cameraRef.current?.click()} className="btn-brand"><Camera className="h-5 w-5" /> Take photo</button>
        <button onClick={() => fileRef.current?.click()} className="btn-secondary"><ImagePlus className="h-5 w-5" /> Choose photos</button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />

      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {items.map((it) => {
          const o = it.result?.opening;
          const blockingChoice = o?.options?.length > 1;
          return (
            <div key={it.key} className={`rounded-xl border p-3 ${it.status === 'opened' ? 'border-brand/50 bg-brand/5' : 'border-border'}`}>
              <div className="flex gap-3">
                {it.thumb ? <img src={it.thumb} alt="" className="h-20 w-16 flex-shrink-0 rounded-md object-cover ring-1 ring-border" /> : <div className="h-20 w-16 flex-shrink-0 rounded-md bg-muted" />}
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  {it.status === 'reading' && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading the page…</p>}
                  {it.status === 'error' && <p className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> {it.error}</p>}
                  {it.status === 'opened' && (
                    <p className="flex flex-wrap items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-brand" /> {it.f.drug_name} {it.f.strength} opened at {it.f.balance || 0} {it.f.unit}
                      <Link href={`/dashboard/register/${it.registerId}`} className="btn-ghost py-1 text-sm"><BookOpen className="h-4 w-4" /> Open book</Link></p>
                  )}
                  {(it.status === 'ready' || it.status === 'opening') && (
                    <>
                      <p className="font-semibold">{it.result?.page?.product_written || 'Product not read'} <span className="font-normal text-muted-foreground">· {o?.rows_checked ?? 0} lines checked</span></p>
                      <div className="grid gap-2 sm:grid-cols-4">
                        <input className="input py-1.5 sm:col-span-2" value={it.f.drug_name} onChange={(e) => update(it.key, (x) => ({ f: { ...x.f, drug_name: e.target.value } }))} placeholder="Drug (generic)" />
                        <input className="input py-1.5" value={it.f.strength} onChange={(e) => update(it.key, (x) => ({ f: { ...x.f, strength: e.target.value } }))} placeholder="Strength" />
                        <input className="input py-1.5" value={it.f.form} onChange={(e) => update(it.key, (x) => ({ f: { ...x.f, form: e.target.value } }))} placeholder="Form" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Balance</span>
                        <input className="input w-24 py-1.5 font-semibold" type="number" min="0" step="any" inputMode="decimal" value={it.f.balance} onChange={(e) => update(it.key, (x) => ({ f: { ...x.f, balance: e.target.value } }))} />
                        <select className="input w-auto py-1.5" value={it.f.unit} onChange={(e) => update(it.key, (x) => ({ f: { ...x.f, unit: e.target.value } }))}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                        <span>as at</span>
                        <input className="input w-auto py-1.5" type="date" max={new Date().toISOString().slice(0, 10)} value={it.f.date} onChange={(e) => update(it.key, (x) => ({ f: { ...x.f, date: e.target.value } }))} />
                      </div>
                      {blockingChoice && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-semibold text-amber-800 dark:text-amber-200">Doesn’t add up — count the stock, then pick:</span>
                          {o.options.map((n: number, i: number) => (
                            <button key={n} type="button" onClick={() => update(it.key, (x) => ({ f: { ...x.f, balance: String(n) } }))} className={`rounded-full border px-2.5 py-0.5 font-semibold ${it.f.balance === String(n) ? 'border-brand bg-brand text-white' : 'border-border'}`}>{n} {i === 0 ? '(as written)' : '(by the sum)'}</button>
                          ))}
                        </div>
                      )}
                      {o?.flags?.filter((x: string) => !/doesn’t add up/i.test(x)).length > 0 && <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">{o.flags.filter((x: string) => !/doesn’t add up/i.test(x)).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>}
                      {it.result?.exempt && <p className="text-xs font-semibold">{it.result.exempt}</p>}
                      {it.result?.existing && <p className="text-xs">Already have a register for {it.result.existing.label} (balance {it.result.existing.balance}). <Link href={`/dashboard/register/${it.result.existing.id}`} className="font-semibold underline">Open it</Link></p>}
                      {it.error && <p className="text-xs text-destructive">{it.error}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => open(it)} disabled={!canOpen(it)} className="btn-primary py-1.5 text-sm">{it.status === 'opening' && <Loader2 className="h-4 w-4 animate-spin" />} Open register</button>
                        <button onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} className="btn-ghost py-1.5 text-sm"><X className="h-4 w-4" /> Discard</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {ready.length > 1 && <button onClick={async () => { for (const it of ready) await open(it); }} className="btn-primary w-full">Open all {ready.length} checked registers</button>}
    </div>
  );
}
