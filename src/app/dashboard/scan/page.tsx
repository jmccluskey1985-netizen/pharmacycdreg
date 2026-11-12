'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, FileText, ImagePlus, Loader2, Plus, RotateCcw, Sun, Maximize, Hand, Sparkles, X, AlertTriangle, Receipt, ClipboardList } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { can } from '@/lib/roles';
import { useStaff } from '@/components/dashboard/staff-context';
import { EntryForm } from '@/components/dashboard/entry-form';

type Page = { file: File; url: string };
type Stage = 'capture' | 'reading' | 'review';

const TIPS = [
  { icon: Maximize, text: 'Fill the frame with the whole page' },
  { icon: Sun, text: 'Good light, no glare or shadows' },
  { icon: Hand, text: 'Lay it flat and hold steady' },
];

/** Downscale big phone photos before upload — faster, and plenty for reading text. */
async function compress(blob: Blob, name: string): Promise<File> {
  if (blob.type === 'application/pdf') return new File([blob], name, { type: blob.type });
  const img = await createImageBitmap(blob).catch(() => null);
  if (!img) return new File([blob], name, { type: blob.type });
  const max = 2400;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.88));
  return new File([out], name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export default function ScanPage() {
  const { staff } = useStaff();
  const [docType, setDocType] = useState<'invoice' | 'prescription'>('invoice');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('type');
    if (t === 'prescription' || t === 'invoice') setDocType(t);
  }, []);
  const [stage, setStage] = useState<Stage>('capture');
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<'off' | 'starting' | 'on' | 'unavailable'>('off');
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState<{ configured: boolean; can_set_up?: boolean } | null>(null);
  useEffect(() => { fetch('/api/scan/status').then((r) => r.json()).then((d) => d && typeof d.configured === 'boolean' && setStatus(d)).catch(() => {}); }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera((c) => (c === 'unavailable' ? c : 'off'));
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCamera('unavailable');
    setCamera('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamera('on');
    } catch {
      setCamera('unavailable');
    }
  }, []);

  // Start the live viewfinder on phones/tablets; desktops get the upload panel.
  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (touch && stage === 'capture') startCamera();
    return stopCamera;
  }, [stage, startCamera, stopCamera]);

  async function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    if ('vibrate' in navigator) navigator.vibrate?.(30);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92));
    const file = await compress(blob, `page-${pages.length + 1}.jpg`);
    setPages((p) => {
      setToast(`Page ${p.length + 1} captured — tap Read, or snap the next page`);
      return [...p, { file, url: URL.createObjectURL(file) }];
    });
    setTimeout(() => setToast(null), 3500);
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const added: Page[] = [];
    for (const f of Array.from(list).slice(0, 10 - pages.length)) {
      const file = await compress(f, f.name);
      added.push({ file, url: f.type === 'application/pdf' ? '' : URL.createObjectURL(file) });
    }
    setPages((p) => [...p, ...added]);
  }

  async function read() {
    if (!pages.length) return;
    stopCamera();
    setStage('reading');
    setError(null);
    try {
      const fd = new FormData();
      pages.forEach((p) => fd.append('file', p.file));
      fd.append('hint', docType);
      const d = await api('/api/scan', { method: 'POST', body: fd });
      setResult({ ...d, done: {} as Record<number, boolean> });
      setStage('review');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not read the document');
      setStage('capture');
    }
  }

  function reset() {
    pages.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    setPages([]);
    setResult(null);
    setError(null);
    setStage('capture');
  }

  if (staff && !can.scan(staff.role)) return <p>Your role can&apos;t scan documents.</p>;

  /* ───────── Reading ───────── */
  if (stage === 'reading') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="relative h-56 w-44 overflow-hidden rounded-lg bg-card shadow-xl ring-1 ring-border">
          {pages[0]?.url ? <img src={pages[0].url} alt="" className="h-full w-full object-cover opacity-80" /> : <FileText className="m-auto mt-20 h-12 w-12 text-muted-foreground" />}
          <div className="absolute inset-x-0 h-16 animate-[scanline_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-brand/50 to-transparent" />
        </div>
        <p className="mt-6 flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-brand" /> Reading {docType === 'invoice' ? 'invoice' : 'prescription'}…</p>
        <p className="mt-1 text-sm text-muted-foreground">Finding controlled drugs and working out quantities</p>
        <style>{`@keyframes scanline{0%{top:-20%}50%{top:85%}100%{top:-20%}}`}</style>
      </div>
    );
  }

  /* ───────── Review drafts ───────── */
  if (stage === 'review' && result) {
    const x = result.extraction;
    const remaining = result.proposals.filter((_: any, i: number) => !result.done[i]).length;
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Check and record</h1>
          <button onClick={reset} className="btn-ghost"><RotateCcw className="h-4 w-4" /> Scan another</button>
        </div>

        <div className="card mb-4 grid gap-1 text-sm">
          <p className="font-semibold capitalize">{x.document_type}{x.reference ? ` · ${x.reference}` : ''}{x.document_date ? ` · ${x.document_date}` : ''}</p>
          {x.supplier_name && <p className="text-muted-foreground">From {x.supplier_name}{x.supplier_address ? `, ${x.supplier_address}` : ''}</p>}
          {x.patient_name && <p className="text-muted-foreground">Patient {x.patient_name}{x.prescriber_name ? ` · Prescriber ${x.prescriber_name}` : ''}</p>}
          <p className="text-muted-foreground">{result.proposals.length} controlled drug line{result.proposals.length === 1 ? '' : 's'} found{result.ignored ? ` · ${result.ignored} other line${result.ignored === 1 ? '' : 's'} ignored` : ''}</p>
        </div>

        {result.exempt?.length > 0 && (
          <div className="mb-4 rounded-xl border border-border bg-muted p-4 text-sm">
            <p className="mb-1 font-semibold">Not entered — no register needed</p>
            <ul className="list-disc pl-5 text-muted-foreground">{result.exempt.map((e: any, i: number) => <li key={i}><b className="text-foreground">{e.label}</b>: {e.reason}</li>)}</ul>
          </div>
        )}

        {x.warnings?.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Check before recording</p>
            <ul className="list-disc pl-5">{x.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        {result.proposals.length === 0 && <div className="card text-center text-muted-foreground">No controlled drugs found on this document.</div>}

        <div className="space-y-4">
          {result.proposals.map((p: any, i: number) => (
            <ProposalCard key={i} p={p} done={!!result.done[i]} onDone={() => setResult({ ...result, done: { ...result.done, [i]: true } })} canRecord={!!staff && can.record(staff.role)} />
          ))}
        </div>

        {result.proposals.length > 0 && remaining === 0 && (
          <div className="card mt-6 flex items-center gap-3 border-brand/40 bg-brand/10">
            <CheckCircle2 className="h-6 w-6 text-brand" />
            <p className="font-semibold">All lines recorded.</p>
            <Link href="/dashboard" className="btn-primary ml-auto">Back to registers</Link>
          </div>
        )}
      </div>
    );
  }

  /* ───────── Capture ───────── */
  const live = camera === 'on' || camera === 'starting';
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
        {([['invoice', 'Invoice / docket', Receipt], ['prescription', 'Prescription', ClipboardList]] as const).map(([v, l, I]) => (
          <button key={v} onClick={() => setDocType(v)} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${docType === v ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
            <I className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>

      {status && !status.configured && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {status.can_set_up
            ? <><b>Scanning isn’t switched on yet.</b> Add the OpenRouter key in <a href="/dashboard/settings" className="font-semibold underline">Settings → Document reading</a> — it switches scanning on for every pharmacy.</>
            : <><b>Reading documents isn’t available right now.</b> You can still make the entry by hand from <b>New entry</b>.</>}
        </div>
      )}
      {error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {/* Live viewfinder (phones) */}
      {live && (
        <div className="relative -mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-2xl" style={{ height: 'min(68vh, 640px)' }}>
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          {/* Document frame: dims everything outside an A4-ish box */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative aspect-[1/1.35] h-[78%] max-w-[86%] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,.55)]">
              {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl'].map((c) => (
                <span key={c} className={`absolute h-10 w-10 border-brand ${c}`} />
              ))}
              <span className="absolute inset-x-3 top-0 h-0.5 animate-[sweep_2.4s_ease-in-out_infinite] bg-brand/80 shadow-[0_0_12px_2px_rgba(84,189,80,.7)]" />
            </div>
          </div>
          <div className="absolute inset-x-0 top-3 flex justify-center px-4">
            <p className="rounded-full bg-black/60 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur">
              {docType === 'invoice' ? 'Line up the whole invoice page inside the frame' : 'Line up the prescription inside the frame'}
            </p>
          </div>
          {camera === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>}
          {flash && <div className="absolute inset-0 bg-white/80" />}
          {toast && <div className="absolute inset-x-0 top-14 flex justify-center px-4"><p className="rounded-full bg-brand px-4 py-2 text-center text-sm font-semibold text-white shadow-lg">{toast}</p></div>}

          {/* Controls */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-6 pb-5 pt-10">
            <button onClick={() => fileRef.current?.click()} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur" aria-label="Choose from photos"><ImagePlus className="h-6 w-6" /></button>
            <button onClick={snap} disabled={camera !== 'on' || pages.length >= 10} className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 transition active:scale-90 disabled:opacity-50" aria-label="Take photo">
              <span className="h-14 w-14 rounded-full bg-white" />
            </button>
            {pages.length > 0 ? (
              <button onClick={read} className="relative flex h-14 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-bold text-white shadow-lg" aria-label="Read the document">
                <Sparkles className="h-5 w-5" /> Read
                <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-brand">{pages.length}</span>
              </button>
            ) : <span className="block h-12 w-12" />}
          </div>
          <style>{`@keyframes sweep{0%,100%{top:4%}50%{top:94%}}`}</style>
        </div>
      )}

      {/* Upload panel (desktop, or no camera) */}
      {!live && (
        <div className="card flex flex-col items-center px-6 py-10 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/15 text-brand"><Camera className="h-8 w-8" /></div>
          <h1 className="text-xl font-bold">{docType === 'invoice' ? 'Scan a wholesaler invoice' : 'Scan a prescription'}</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {docType === 'invoice' ? 'Controlled drug lines are picked out and pack quantities converted to units. You check each line before it goes in the register.' : 'Patient, prescriber and quantity are read for you to check before recording the supply.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={() => fileRef.current?.click()} className="btn-primary"><ImagePlus className="h-4 w-4" /> Choose photo or PDF</button>
            {camera !== 'unavailable' && <button onClick={startCamera} className="btn-secondary"><Camera className="h-4 w-4" /> Use camera</button>}
          </div>
          {camera === 'unavailable' && <p className="mt-3 text-xs text-muted-foreground">Camera not available — choose a photo instead.</p>}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

      {/* Tips */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {TIPS.map((t) => (
          <div key={t.text} className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3 text-center text-xs text-muted-foreground ring-1 ring-border">
            <t.icon className="h-5 w-5 text-brand" /> {t.text}
          </div>
        ))}
      </div>

      {/* Captured pages */}
      {pages.length > 0 && (
        <div className="card mt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">{pages.length} page{pages.length === 1 ? '' : 's'}</p>
            <p className="text-xs text-muted-foreground">Multi-page docket? Add each page.</p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {pages.map((p, i) => (
              <div key={i} className="relative flex-shrink-0">
                {p.url ? <img src={p.url} alt={`Page ${i + 1}`} className="h-28 w-20 rounded-lg object-cover ring-1 ring-border" /> : <div className="flex h-28 w-20 items-center justify-center rounded-lg bg-muted"><FileText className="h-8 w-8 text-muted-foreground" /></div>}
                <button onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background" aria-label={`Remove page ${i + 1}`}><X className="h-4 w-4" /></button>
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
              </div>
            ))}
            {!live && pages.length < 10 && (
              <button onClick={() => fileRef.current?.click()} className="flex h-28 w-20 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground"><Plus className="h-6 w-6" /></button>
            )}
          </div>
          <button onClick={read} className="btn-brand mt-4 w-full text-base"><Sparkles className="h-5 w-5" /> Read {pages.length > 1 ? `${pages.length} pages` : 'document'}</button>
        </div>
      )}
    </div>
  );
}

function ProposalCard({ p, done, onDone, canRecord }: { p: any; done: boolean; onDone: () => void; canRecord: boolean }) {
  const [registerId, setRegisterId] = useState<string | null>(p.register_id);
  const [open, setOpen] = useState(false);
  const chosen = p.candidates.find((c: any) => c.id === registerId);
  const conf = p.item.confidence as 'high' | 'medium' | 'low';
  const confCls = conf === 'high' ? 'bg-brand/15 text-primary' : conf === 'medium' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';

  return (
    <div className={`card ${done ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{p.item.drug_name} {p.item.strength} <span className="font-normal text-muted-foreground">{p.item.form}</span></p>
          <p className="text-sm text-muted-foreground">{p.qty?.label ?? `${p.item.pack_description} → ${p.item.quantity}`} {p.qty?.quantity != null && <b className="text-foreground">→ {p.qty.quantity} {p.item.quantity_unit}</b>}</p>
          {p.item.brand && <p className="text-xs text-muted-foreground">Brand: {p.item.brand}</p>}
          {p.item.notes && <p className="mt-1 text-xs text-muted-foreground">{p.item.notes}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`badge ${confCls}`}>{conf} confidence</span>
          {p.match_state && <span className={`badge ${p.match_state === 'your_register' ? 'bg-brand/15 text-primary' : p.match_state === 'pick_register' ? 'bg-amber-100 text-amber-900' : 'bg-muted text-muted-foreground'}`}>{p.match_state === 'your_register' ? 'YOUR REGISTER' : p.match_state === 'pick_register' ? 'PICK REGISTER' : 'NO REGISTER YET'}</span>}
        </div>
      </div>
      {p.qty?.flags?.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {p.qty.flags.map((f: string, i: number) => <li key={i}>⚠ {f}</li>)}
        </ul>
      )}

      {done ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4" /> Recorded</p>
      ) : (
        <>
          <div className="mt-3">
            <label className="label">Register</label>
            {p.candidates.length ? (
              <select className="input" value={registerId ?? ''} onChange={(e) => setRegisterId(e.target.value || null)}>
                <option value="">Choose register…</option>
                {p.candidates.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            ) : (
              <p className="rounded-lg bg-muted p-3 text-sm">No open register for this product. <Link href="/dashboard" className="text-primary underline">Open one</Link>, then scan again.</p>
            )}
          </div>
          {registerId && !open && canRecord && <button onClick={() => setOpen(true)} className="btn-primary mt-3 w-full">Check details &amp; record</button>}
          {registerId && !canRecord && <p className="mt-3 text-sm text-muted-foreground">A pharmacist needs to confirm this entry.</p>}
          {registerId && open && (
            <div className="mt-4 border-t border-border pt-4">
              <EntryForm
                registerId={registerId}
                unit={chosen?.label ? p.item.quantity_unit : 'units'}
                balance={registerId === p.register_id ? Number(p.current_balance ?? 0) : NaN}
                initial={p.draft}
                lockType
                submitLabel="Confirm & record"
                onCancel={() => setOpen(false)}
                onSaved={() => { setOpen(false); onDone(); }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
