'use client';

import { useEffect, useRef, useState } from 'react';
import { BookUser, History, Stethoscope, Truck, UserRound, UserPlus } from 'lucide-react';

export interface Suggestion {
  name: string;
  address: string | null;
  registration?: string | null;
  gms_number?: string | null;
  role?: string | null;
  source: 'list' | 'register' | 'gms' | 'preset' | 'patient';
  patient_id?: string;
  dob?: string | null;
  detail?: string;
  usual_prescriber?: { name: string; address: string | null } | null;
}

type Kind = 'patient' | 'prescriber' | 'supplier' | 'witness';

/**
 * Text input that suggests people/companies from the pharmacy's Doctors & suppliers
 * list and its own register history. Picking one calls onPick so the form can fill
 * the linked fields (address, registration, capacity).
 */
export function QuickFillInput({ kind, value, onChange, onPick, onCreate, createLabel, required, placeholder, id }: {
  kind: Kind;
  /** Offer "+ New …" at the bottom of the list (e.g. create a patient record). */
  onCreate?: (typed: string) => void;
  createLabel?: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (s: Suggestion) => void;
  required?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const load = async (q: string) => {
    try {
      const res = await fetch(`/api/suggest?kind=${kind}&q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const d = await res.json();
      setItems(d.suggestions ?? []);
      setOpen(true);
      setActive(0);
    } catch { setItems([]); }
  };

  useEffect(() => {
    if (!typed.current || value.trim().length < 2) { if (typed.current) setItems([]); return; }
    const t = setTimeout(() => load(value.trim()), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, kind]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (s: Suggestion) => { typed.current = false; onPick(s); setOpen(false); setItems([]); };

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        className="input"
        required={required}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-autocomplete="list"
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onFocus={() => {
          // Suppliers: show your usual ones (and the main Irish wholesalers) straight away.
          if (kind === 'supplier' && !value.trim()) load('');
          else if (items.length) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (items.length > 0 || (onCreate && value.trim().length >= 2)) && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-card py-1 shadow-xl">
          {items.map((s, i) => (
            <li key={`${s.name}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                title={s.detail}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-secondary' : ''}`}
              >
                {s.source === 'list' ? <BookUser className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" /> : s.source === 'gms' ? <Stethoscope className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-600" /> : s.source === 'preset' ? <Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" /> : s.source === 'patient' ? <UserRound className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" /> : <History className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                <span className="min-w-0">
                  <span className="block font-medium">{s.name}{s.registration ? <span className="font-normal text-muted-foreground"> · IMC {s.registration}</span> : null}{s.dob ? <span className="font-normal text-muted-foreground"> · {s.dob.split('-').reverse().join('/')}</span> : null}{s.gms_number ? <span className="font-normal text-muted-foreground"> · GMS {s.gms_number}</span> : null}</span>
                  {(s.address || s.role) && <span className="block truncate text-xs text-muted-foreground">{s.address || s.role}</span>}
                  {s.usual_prescriber && <span className="block truncate text-xs text-brand">Usually {s.usual_prescriber.name}</span>}
                  {s.source === 'gms' && <span className="block text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">HSE GMS list</span>}
                </span>
              </button>
            </li>
          ))}
          {onCreate && value.trim().length >= 2 && (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); onCreate(value.trim()); }} className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-secondary">
                <UserPlus className="h-4 w-4" /> {createLabel ?? 'Add new'} “{value.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
