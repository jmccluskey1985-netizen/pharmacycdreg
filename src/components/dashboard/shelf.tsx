'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { productFor, CD_PRODUCTS } from '@/data/cd-products';

interface Reg {
  id: string; balance: number; low_stock?: boolean; check_due?: boolean;
  product: { drug_name: string; class_name: string; strength: string; form: string; unit: string; parent?: { drug_name: string } | null };
}
interface TypeGroup { key: string; brand: string; form: string; order: number; regs: Reg[] }

const strengthNum = (s: string) => parseFloat(s.replace(',', '.')) || 0;

/** Drug (class) → type (brand + form, e.g. OxyNorm capsules, OxyContin PR) → strengths. */
function arrange(regs: Reg[]) {
  const byClass = new Map<string, Map<string, TypeGroup>>();
  for (const r of regs) {
    const p = productFor(r.product.drug_name, r.product.form);
    const key = p ? p.key : `${r.product.drug_name}|${r.product.form}`;
    const types = byClass.get(r.product.class_name) ?? new Map<string, TypeGroup>();
    const g = types.get(key) ?? { key, brand: p?.brands[0] ?? r.product.drug_name, form: p?.form ?? r.product.form, order: p ? CD_PRODUCTS.indexOf(p) : 999, regs: [] };
    g.regs.push(r);
    types.set(key, g);
    byClass.set(r.product.class_name, types);
  }
  return [...byClass.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cls, types]) => ({
      cls,
      types: [...types.values()].sort((a, b) => a.order - b.order || a.brand.localeCompare(b.brand)).map((t) => ({ ...t, regs: t.regs.sort((a, b) => strengthNum(a.product.strength) - strengthNum(b.product.strength)) })),
    }));
}

/** Sideways, swipeable shelf: one row per drug, its registers grouped by type then strength. */
export function Shelf({ regs }: { regs: Reg[] }) {
  const rows = arrange(regs);
  return (
    <div className="space-y-8">
      <style>{`@keyframes shelf-in{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}`}</style>
      {rows.map((row) => <ShelfRow key={row.cls} cls={row.cls} types={row.types} />)}
    </div>
  );
}

function ShelfRow({ cls, types }: { cls: string; types: TypeGroup[] }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' });
  const jump = (key: string) => {
    const el = track.current?.querySelector<HTMLElement>(`[data-type="${key}"]`);
    if (el && track.current) track.current.scrollTo({ left: el.offsetLeft - track.current.offsetLeft - 8, behavior: 'smooth' });
  };
  const count = types.reduce((n, t) => n + t.regs.length, 0);
  let i = 0;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-bold">{cls}</h2>
        <span className="text-xs text-muted-foreground">{count} register{count === 1 ? '' : 's'}</span>
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button key={t.key} onClick={() => jump(t.key)} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-semibold text-muted-foreground transition hover:border-brand hover:text-foreground">
              {t.brand} <span className="font-normal">{t.form}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto hidden gap-1 sm:flex">
          <button onClick={() => scroll(-1)} className="rounded-full border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Scroll ${cls} left`}><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => scroll(1)} className="rounded-full border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Scroll ${cls} right`}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={track} className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-3 sm:mx-0 sm:px-1 [scrollbar-width:thin]">
        {types.map((t) => (
          <div key={t.key} data-type={t.key} className="flex flex-shrink-0 snap-start gap-3">
            {/* Type divider: brand + form */}
            <div className="flex h-48 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted" title={`${t.brand} · ${t.form}`}>
              <span className="max-h-44 truncate whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl] rotate-180">{t.brand}</span>
            </div>
            {t.regs.map((r) => {
              const delay = Math.min(i++ * 45, 600);
              return (
                <Link key={r.id} href={`/dashboard/register/${r.id}`} style={{ animation: `shelf-in .45s ease-out ${delay}ms both` }}
                  className="group relative flex h-48 w-40 flex-shrink-0 snap-start flex-col overflow-hidden rounded-r-xl rounded-l-md bg-gradient-to-br from-brand-dark to-brand-deep p-3.5 pl-5 text-white shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <span className="absolute inset-y-0 left-0 w-2 bg-black/25" aria-hidden />
                  <span className="absolute inset-y-0 left-2 w-px bg-white/20" aria-hidden />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/55">{t.brand}</p>
                  <p className="mt-1 text-2xl font-bold leading-none tabular-nums">{r.product.strength}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-white/75">{r.product.form}</p>
                  {r.product.parent && <p className="mt-1 text-[10px] text-white/70">Stereoisomer of {r.product.parent.drug_name}</p>}
                  <div className="mt-auto">
                    {(r.low_stock || r.check_due) && (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {r.low_stock && <span className="rounded-full bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">Low</span>}
                        {r.check_due && <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-brand-deep">Check due</span>}
                      </div>
                    )}
                    <p className="text-[10px] text-white/55">Balance</p>
                    <p className="text-xl font-bold tabular-nums">{r.balance}<span className="ml-1 text-xs font-normal text-white/70">{r.product.unit}</span></p>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
