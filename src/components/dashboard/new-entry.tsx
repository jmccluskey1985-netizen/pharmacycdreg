'use client';
import { productTitle, brandOf, genericLine } from '@/lib/product-name';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, PackageMinus, PackagePlus, Camera, Keyboard, Flame, Undo2, ArrowLeft, Search, BookPlus } from 'lucide-react';
import { can } from '@/lib/roles';
import { Modal } from '@/components/modal';
import { api } from '@/lib/api';
import { useStaff } from './staff-context';

type Source = 'dispensing' | 'invoice' | 'destruction' | 'patient_return';
interface Reg { id: string; balance: number; closed_at: string | null; product: { drug_name: string; strength: string; form: string; unit: string; brand?: string | null } }

const SOURCES: { key: Source; title: string; text: string; icon: any; entry: string; scan?: 'prescription' | 'invoice' }[] = [
  { key: 'dispensing', title: 'From a dispensing', text: 'Supplied to a patient on a prescription', icon: PackageMinus, entry: 'supply', scan: 'prescription' },
  { key: 'invoice', title: 'From an invoice', text: 'Stock received from a wholesaler', icon: PackagePlus, entry: 'receipt', scan: 'invoice' },
  { key: 'destruction', title: 'Destruction', text: 'Witnessed destruction of stock', icon: Flame, entry: 'destruction' },
  { key: 'patient_return', title: 'Patient return', text: 'Returned by a patient', icon: Undo2, entry: 'patient_return' },
];

/** Top-left "New entry": pick where the details come from, then scan it or type it in. */
export function NewEntryButton() {
  const router = useRouter();
  const { pharmacy, staff } = useStaff();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<(typeof SOURCES)[number] | null>(null);
  const [typing, setTyping] = useState(false);
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (typing && !regs) api('/api/registers').then((d) => setRegs(d.registers.filter((r: Reg) => !r.closed_at))).catch(() => setRegs([]));
  }, [typing, regs]);

  const close = () => { setOpen(false); setSource(null); setTyping(false); setQ(''); };
  const go = (href: string) => { close(); router.push(href); };
  const shown = (regs ?? []).filter((r) => `${productTitle(r.product)} ${r.product.drug_name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><Plus className="h-4 w-4" /> New entry</button>
      <Modal open={open} onClose={close} title={!source ? 'New entry' : typing ? `${source.title} — choose the register` : source.title}>
        {!source && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCES.map((s) => (
              <button key={s.key} onClick={() => (s.scan ? setSource(s) : (setSource(s), setTyping(true)))} className="flex items-start gap-3 rounded-xl border border-border p-4 text-left transition hover:border-brand hover:bg-brand/5">
                <s.icon className="mt-0.5 h-6 w-6 flex-shrink-0 text-brand" />
                <span><span className="block font-semibold">{s.title}</span><span className="block text-sm text-muted-foreground">{s.text}</span></span>
              </button>
            ))}
            {staff && can.openRegister(staff.role) && (
              <button onClick={() => go('/dashboard?new=register')} className="flex items-start gap-3 rounded-xl border border-dashed border-border p-4 text-left transition hover:border-brand hover:bg-brand/5 sm:col-span-2">
                <BookPlus className="mt-0.5 h-6 w-6 flex-shrink-0 text-brand" />
                <span><span className="block font-semibold">New CD book</span><span className="block text-sm text-muted-foreground">Start a register for a drug you don’t have one for yet — type it in, pick from the CD list, or snap the paper page</span></span>
              </button>
            )}
          </div>
        )}

        {source && !typing && (
          <div className="space-y-3">
            {source.key === 'dispensing' && pharmacy?.halo_enabled && (
              <p className="rounded-lg bg-secondary p-3 text-sm">Dispensed in Halo? It arrives in <b>To confirm</b> automatically — no need to enter it here.</p>
            )}
            <button onClick={() => go(`/dashboard/scan?type=${source.scan}`)} className="flex w-full items-center gap-3 rounded-xl border-2 border-brand bg-brand/5 p-4 text-left hover:bg-brand/10">
              <Camera className="h-6 w-6 text-brand" />
              <span><span className="block font-semibold">Snap the {source.key === 'invoice' ? 'invoice or CD docket' : 'prescription'}</span><span className="block text-sm text-muted-foreground">Reads the drug and quantity{source.key === 'invoice' ? ', supplier and invoice number' : ', patient and prescriber'} for you to check</span></span>
            </button>
            <button onClick={() => setTyping(true)} className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left hover:bg-muted">
              <Keyboard className="h-6 w-6 text-muted-foreground" />
              <span><span className="block font-semibold">Type it in</span><span className="block text-sm text-muted-foreground">Choose the register and fill in the details</span></span>
            </button>
            <button onClick={() => setSource(null)} className="btn-ghost text-sm"><ArrowLeft className="h-4 w-4" /> Back</button>
          </div>
        )}

        {source && typing && (
          <div className="space-y-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus className="input pl-9" placeholder="Search drug…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {regs === null && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
              {regs && shown.length === 0 && <p className="p-4 text-sm text-muted-foreground">No CD book for that yet. <button onClick={() => go('/dashboard?new=register')} className="font-semibold text-primary underline">Open a new CD book</button></p>}
              {shown.map((r) => (
                <button key={r.id} onClick={() => go(`/dashboard/register/${r.id}?new=${source.entry}`)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60">
                  <span className="font-medium">{brandOf(r.product) ?? r.product.drug_name} {r.product.strength} <span className="font-normal text-muted-foreground">{r.product.form}</span></span>
                  <span className="text-sm tabular-nums text-muted-foreground">{r.balance} {r.product.unit}</span>
                </button>
              ))}
            </div>
            <button onClick={() => (source.scan ? setTyping(false) : setSource(null))} className="btn-ghost text-sm"><ArrowLeft className="h-4 w-4" /> Back</button>
          </div>
        )}
      </Modal>
    </>
  );
}
