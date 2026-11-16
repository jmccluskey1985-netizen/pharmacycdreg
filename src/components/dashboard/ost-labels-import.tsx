'use client';
import { useState } from 'react';
import { OstOnboardDemo } from '@/components/ost-onboard-demo';
import { Loader2, Tags, Check } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Modal } from '@/components/modal';

interface Proposal {
  first_name: string; surname: string; address: string | null; treatment_card_no: string | null; pmr_code: string | null; product: string | null; daily_dose: number | null; dose_text: string | null;
  register_id: string | null; candidates: { id: string; first_name: string; surname: string; address: string | null; level: string; reasons: string[] }[]; pick_id: string | null;
}
type Row = Proposal & { include: boolean; patient_id: string | 'new'; card: string; reg: string; dose: string };

/**
 * Build the OST patient list from photos of dispensing bag labels: accurate, printed details.
 * Each person is matched to an existing record where possible; you check and save.
 */
export function OstLabelsImport({ onDone, autoOpen = false }: { onDone: () => void; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [regs, setRegs] = useState<{ id: string; label: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const close = () => { setOpen(false); setRows(null); setMsg(null); };
  const upd = (i: number, x: Partial<Row>) => setRows((r) => r && r.map((row, j) => (j === i ? { ...row, ...x } : row)));

  async function read(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      const res = await fetch('/api/scan/labels', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not read the labels');
      setRegs(d.registers ?? []);
      setRows((d.patients as Proposal[]).map((p) => ({ ...p, include: true, patient_id: p.pick_id ?? 'new', card: p.treatment_card_no ?? '', reg: p.register_id ?? '', dose: p.daily_dose != null ? String(p.daily_dose) : '' })));
      if (!d.patients?.length) setMsg({ ok: false, text: 'No methadone or buprenorphine labels found in the photo.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not read the labels' }); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!rows) return;
    setBusy(true); setMsg(null);
    try {
      const d = await api('/api/patients/ost-import', { method: 'POST', json: { patients: rows.filter((r) => r.include).map((r) => ({ patient_id: r.patient_id === 'new' ? null : r.patient_id, first_name: r.first_name, surname: r.surname, address: r.address, treatment_card_no: r.card || null, pmr_code: r.pmr_code || null, register_id: r.reg || null, daily_dose: r.dose ? Number(r.dose) : null, schedule: null })) } });
      setMsg({ ok: true, text: `Saved: ${d.added} added, ${d.updated} updated on the OST list.` });
      setRows(null); onDone();
    } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save' }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary"><Tags className="h-4 w-4" /> <span className="hidden sm:inline">From bag labels</span></button>
      <Modal open={open} onClose={close} title="OST patients from bag labels" wide>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">A one-off start: lay out a bag label for each of your methadone and buprenorphine patients and photograph them (several per photo is fine). Printed labels give accurate names, addresses and your dispensing system’s patient code, e.g. <b>(F12)</b>, which then identifies the patient on every OST form. The photos aren’t kept.</p>
          {!rows && !busy && <OstOnboardDemo compact />}
          {!rows && (
            <label className={`btn-primary w-fit cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tags className="h-4 w-4" />} {busy ? 'Reading labels…' : 'Take or choose photos'}
              <input type="file" accept="image/*,application/pdf" multiple capture="environment" className="sr-only" onChange={(e) => read(e.target.files)} />
            </label>
          )}
          {rows && rows.length > 0 && (
            <div className="space-y-2">
              {regs.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2">
                  <span className="font-medium">Product for everyone:</span>
                  <select className="input max-w-xs py-1.5" aria-label="Product for everyone" defaultValue="" onChange={(e) => e.target.value && setRows((rs) => rs && rs.map((x) => ({ ...x, reg: e.target.value })))}>
                    <option value="">Choose…</option>
                    {regs.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">then change any that differ</span>
                </div>
              )}
              {rows.map((r, i) => (
                <div key={i} className={`rounded-lg border p-3 ${r.include ? 'border-border' : 'border-dashed opacity-60'}`}>
                  <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={r.include} onChange={(e) => upd(i, { include: e.target.checked })} /> {r.first_name} {r.surname}{r.pmr_code && <span className="badge bg-muted font-mono text-muted-foreground">{r.pmr_code}</span>}<span className="font-normal text-muted-foreground">{r.address ? ` · ${r.address}` : ''}</span></label>
                  {(r.product || r.dose_text) && <p className="mt-0.5 text-xs text-muted-foreground">{[r.product, r.dose_text].filter(Boolean).join(' · ')}</p>}
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <select className="input py-1.5 sm:col-span-2" aria-label="Patient record" value={r.patient_id} onChange={(e) => upd(i, { patient_id: e.target.value })}>
                      {r.candidates.map((c) => <option key={c.id} value={c.id}>Existing: {c.first_name} {c.surname}{c.address ? `, ${c.address}` : ''} ({c.level})</option>)}
                      <option value="new">New patient</option>
                    </select>
                    <select className="input py-1.5" aria-label="Product" value={r.reg} onChange={(e) => upd(i, { reg: e.target.value })}>
                      <option value="">Product…</option>
                      {regs.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </select>
                    <input className="input py-1.5" aria-label="Treatment card no." placeholder="Card no. (PH…)" value={r.card} onChange={(e) => upd(i, { card: e.target.value })} />
                  </div>
                </div>
              ))}
              <button onClick={save} disabled={busy || !rows.some((r) => r.include)} className="btn-primary w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save {rows.filter((r) => r.include).length} to the OST list</button>
            </div>
          )}
          {msg && <p className={`rounded-lg p-3 ${msg.ok ? 'bg-secondary' : 'bg-destructive/10 text-destructive'}`}>{msg.text}</p>}
        </div>
      </Modal>
    </>
  );
}
