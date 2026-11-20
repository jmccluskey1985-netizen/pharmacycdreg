'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer, FileSpreadsheet, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useStaff } from '@/components/dashboard/staff-context';
import { buildSections, ddmmyyyy, downloadSheetXlsx, hhmm, lastCheckedText } from '@/lib/stock-sheet';

/**
 * Printable list of every open CD book: balance now and when its stock was last checked.
 * Optional extra columns to write a physical count against.
 */
export default function StockSheet() {
  const { pharmacy } = useStaff();
  const [regs, setRegs] = useState<any[] | null>(null);
  const [when, setWhen] = useState(() => new Date());
  const [withCount, setWithCount] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/registers').then((d) => { setRegs(d.registers ?? []); setWhen(new Date()); }).catch(() => setRegs([])); }, []);
  const sections = useMemo(() => buildSections(regs ?? []), [regs]);
  const count = sections.reduce((n, s) => n + s.rows.length, 0);
  const due = sections.reduce((n, s) => n + s.rows.filter((r) => r.due).length, 0);
  const cols = withCount ? 6 : 3;

  async function excel() {
    setBusy(true);
    try { await downloadSheetXlsx(sections, { name: pharmacy?.name, address: pharmacy?.address }, when, withCount); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">CD balances</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Every open CD book with its balance right now and when its stock was last checked. Print it, save it as a PDF, or download it for Excel.</p>
          <label className="mt-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withCount} onChange={(e) => setWithCount(e.target.checked)} className="h-4 w-4" />
            Add columns to write a stock count (Stock, Difference, Initials)
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={excel} disabled={!count || busy} className="btn-secondary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel</button>
          <button onClick={() => window.print()} disabled={!count} className="btn-primary"><Printer className="h-4 w-4" /> Print / PDF</button>
        </div>
      </div>

      <div className="print-page rounded-xl bg-white p-6 text-black shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-[#184B21] pb-3">
          <div>
            <p className="text-3xl font-extrabold tracking-tight text-[#184B21]">{withCount ? 'CD Stock Count' : 'CD Balances'}</p>
            <p className="text-sm text-slate-600">{[pharmacy?.name, pharmacy?.address].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">Date: {ddmmyyyy(when)}</p>
            <p className="text-xs text-slate-600">Balances at {hhmm(when)} · {count} book{count === 1 ? '' : 's'}{due ? ` · ${due} stock check${due === 1 ? '' : 's'} due` : ''}</p>
          </div>
        </div>
        {withCount && (
          <div className="mt-3 grid grid-cols-2 gap-6 text-sm">
            <p>Counted by: <span className="inline-block w-40 border-b border-black align-bottom sm:w-56" /></p>
            <p>Checked by: <span className="inline-block w-40 border-b border-black align-bottom sm:w-56" /></p>
          </div>
        )}

        {regs === null ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading your books…</p>
        ) : !count ? (
          <p className="mt-6 text-sm text-slate-600">No CD books are open yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto print:overflow-visible">
            <table className={`w-full border-collapse print:min-w-0 ${withCount ? 'min-w-[720px] text-[14px] print:text-[12px]' : 'min-w-[520px] text-[15px] print:text-[13px]'}`}>
              <thead className="print:table-header-group">
                <tr className="bg-[#B7B7B7] [&>th]:border [&>th]:border-slate-400 [&>th]:px-3 [&>th]:py-2">
                  <th className="text-left">CD Medicine</th>
                  <th className="w-[120px]">{withCount ? 'Register' : 'Balance'}</th>
                  <th className="w-[190px]">Last stock check</th>
                  {withCount && <><th className="w-[90px]">Stock</th><th className="w-[90px]">Difference</th><th className="w-[70px]">Initials</th></>}
                </tr>
              </thead>
              {sections.map((s) => (
                <tbody key={s.title} className="break-inside-avoid-page">
                  <tr><td colSpan={cols} className="border border-slate-400 bg-[#E6F4E5] px-3 py-1.5 font-bold text-[#184B21]">{s.title}</td></tr>
                  {s.rows.map((r, i) => (
                    <tr key={i} className={`break-inside-avoid [&>td]:border [&>td]:border-slate-400 [&>td]:px-3 ${withCount ? 'h-11' : 'h-10'}`}>
                      <td>{r.label}{r.quarantined ? <span className="ml-1 text-xs text-slate-600">(incl. {r.quarantined} set aside)</span> : null}</td>
                      <td className="text-center font-bold tabular-nums">{r.balance} <span className="text-xs font-normal text-slate-600">{r.unit}</span></td>
                      <td className={`text-center text-[13px] ${r.due ? 'font-semibold text-amber-700' : !r.lastChecked ? 'text-slate-500' : ''}`}>{lastCheckedText(r, when)}</td>
                      {withCount && <><td /><td /><td /></>}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-600">
          {withCount ? 'Any difference: investigate, then record it in the register with Stock check. The original lines stay and a correction is added. ' : 'Balances include stock set aside for destruction. “Due” follows your Settings → Stock checks frequency. '}
          Printed from PharmacyCDReg.ie on {ddmmyyyy(when)} at {hhmm(when)}.
        </p>
      </div>
    </div>
  );
}
