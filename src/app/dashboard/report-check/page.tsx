'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileSearch, Loader2, CheckCircle2, BookPlus, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStaff, useCan } from '@/components/dashboard/staff-context';
import { can } from '@/lib/roles';
import { canWrite } from '@/lib/stripe';
import { ReportCheck } from '@/components/dashboard/report-check';

interface Book { register_id: string; label: string; unit: string; balance: number; lines: any[]; skipped: number; warnings: string[] }
interface Result { books: Book[]; unmatched: { product: string | null; date: string; quantity: number }[]; skipped: number; warnings: string[]; exact: boolean }
const fmt = (d: string) => d.split('-').reverse().join('/');

/**
 * Stock check across every book from one dispensing report: any number of pages (photos) or the
 * saved report file in whatever format the dispensing system produces (PDF, Excel, CSV, HTML,
 * Touchstore .QRP…). Each line goes to its book; anything not in a register is highlighted there.
 */
export default function ReportCheckAll() {
  const { staff, pharmacy } = useStaff();
  const canDo = useCan();
  const writable = canWrite(pharmacy?.subscription_status);
  const mayCheck = !!staff && canDo('stockCheck') && writable;
  const mayRecord = !!staff && can.record(staff.role) && writable;
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [run, setRun] = useState(0);

  async function check(list: File[]) {
    if (!list.length) return;
    setBusy(true); setError(null); setRes(null);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append('file', f));
      setRes(await api('/api/stock-checks/reconcile-all', { method: 'POST', body: fd }));
      setRun((n) => n + 1);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not read the report'); }
    finally { setBusy(false); }
  }
  const add = (l: FileList | null) => { if (l?.length) setFiles((f) => [...f, ...Array.from(l)].slice(0, 10)); };

  const issues = (b: Book) => b.lines.filter((l) => l.status !== 'in_register').length;
  const withIssues = res?.books.filter((b) => issues(b) > 0) ?? [];
  const clean = res?.books.filter((b) => issues(b) === 0) ?? [];
  const missing = res?.books.reduce((n, b) => n + b.lines.filter((l) => l.status === 'missing').length, 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Check a dispensing report</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Upload your dispensing system’s CD report (Touchstore, MPS or any other) and every line is checked against every book at once. Anything not in a register is highlighted in its book, ready to tick and add.</p>
      </div>

      {!mayCheck ? (
        <p className="card p-4 text-sm text-muted-foreground">Your role can’t record stock checks. Ask your supervising pharmacist (Settings → Roles &amp; permissions).</p>
      ) : (
        <div className="card space-y-3 p-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
              <Upload className="h-4 w-4" /> {files.length ? 'Add more pages or files' : 'Choose report pages or file'}
              <input type="file" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            </label>
            {files.length > 0 && <button onClick={() => check(files)} disabled={busy} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />} {busy ? 'Checking every book…' : `Check ${files.length} file${files.length === 1 ? '' : 's'} against all books`}</button>}
            {files.length > 0 && !busy && <button onClick={() => { setFiles([]); setRes(null); setError(null); }} className="btn-ghost text-sm">Clear</button>}
          </div>
          {files.length > 0 && <ul className="flex flex-wrap gap-1.5 text-xs">{files.map((f, i) => <li key={i} className="rounded-full bg-muted px-2.5 py-1">{f.name || `Page ${i + 1}`}</li>)}</ul>}
          <p className="text-xs text-muted-foreground">Up to 10 at a time: a photo of each page, or the saved report in any format (PDF, Excel, CSV, HTML, Touchstore .QRP…). You can drop files here. Touchstore .QRP files are read exactly, without the AI reader. The report isn’t kept.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {res && (
        <div className="space-y-4" key={run}>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold">{res.books.length} book{res.books.length === 1 ? '' : 's'} on the report</span>
            <span className={`rounded-full px-2.5 py-1 font-semibold ${missing ? 'bg-amber-100 text-amber-900' : 'bg-brand/15 text-brand-dark'}`}>{missing} missing entr{missing === 1 ? 'y' : 'ies'}</span>
            {res.unmatched.length > 0 && <span className="rounded-full bg-muted px-2.5 py-1 font-semibold">{res.unmatched.length} line{res.unmatched.length === 1 ? '' : 's'} for products without a book</span>}
            {res.exact && <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-900">Read exactly from the .QRP file</span>}
          </div>
          {res.warnings.length > 0 && <ul className="space-y-0.5 text-xs text-amber-800">{res.warnings.map((w, k) => <li key={k}>⚠ {w}</li>)}</ul>}

          {withIssues.length === 0 && res.books.length > 0 && <p className="flex items-center gap-2 font-semibold text-brand"><CheckCircle2 className="h-5 w-5" /> Every line on the report is in its register.</p>}

          {withIssues.map((b) => (
            <ReportCheck key={b.register_id} registerId={b.register_id} unit={b.unit} balance={b.balance} counted={null} draft={!mayRecord} onAdded={() => {}}
              preloaded={{ lines: b.lines, skipped: 0, warnings: [] }}
              title={<div className="flex flex-wrap items-baseline justify-between gap-2"><Link href={`/dashboard/register/${b.register_id}`} className="text-base font-bold hover:underline">{b.label}</Link><span className="text-xs text-muted-foreground">Balance {b.balance} {b.unit}</span></div>} />
          ))}

          {clean.length > 0 && (
            <details className="card p-3 text-sm">
              <summary className="cursor-pointer font-semibold"><CheckCircle2 className="mr-1 inline h-4 w-4 text-brand" /> {clean.length} book{clean.length === 1 ? '' : 's'} match the report</summary>
              <ul className="mt-2 space-y-0.5 pl-5 text-muted-foreground">{clean.map((b) => <li key={b.register_id}>✓ {b.label}: {b.lines.length} line{b.lines.length === 1 ? '' : 's'}, all in the register</li>)}</ul>
            </details>
          )}

          {res.unmatched.length > 0 && (
            <div className="card space-y-2 p-3 text-sm">
              <p className="font-semibold">On the report, but no book for the product</p>
              <ul className="space-y-0.5 text-muted-foreground">{res.unmatched.map((u, i) => <li key={i}>{fmt(u.date)} · {u.product ?? 'Product not read'} · {u.quantity}</li>)}</ul>
              <p className="text-xs text-muted-foreground">Not a register drug (e.g. Schedule 4), or a book you haven’t opened yet. To add one, open it from Registers.</p>
              <Link href="/dashboard" className="btn-secondary w-fit"><BookPlus className="h-4 w-4" /> Registers</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
