'use client';

import { Printer } from 'lucide-react';
import { useStaff } from '@/components/dashboard/staff-context';

/**
 * Paper fallback sheet for when the system (or the internet) is unavailable. Print a few and
 * keep them with the CD cabinet; enter each line into the register as soon as it's back, as a
 * late entry ("entered from the paper fallback sheet"), and keep the sheet.
 */
export default function FallbackSheet() {
  const { pharmacy } = useStaff();
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Paper fallback sheet</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">If the system or the internet is down, record CD transactions on this sheet. When it’s back, enter each line in the right register — it’s flagged as a late entry; give the reason “entered from paper fallback sheet” — tick the last column, and keep the sheet with your CD records.</p>
        </div>
        <button onClick={() => window.print()} className="btn-primary"><Printer className="h-4 w-4" /> Print</button>
      </div>
      <div className="print-page rounded-xl bg-white p-6 text-black shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b-2 border-black pb-2">
          <div>
            <p className="text-lg font-bold">Controlled Drugs — paper fallback record</p>
            <p className="text-sm">{pharmacy?.name ?? 'Pharmacy'}{pharmacy?.address ? ` · ${pharmacy.address}` : ''}</p>
          </div>
          <p className="text-sm">Sheet no. ______ &nbsp; System down from ____/____ ____:____ to ____/____ ____:____</p>
        </div>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="[&>th]:border [&>th]:border-black [&>th]:p-1 [&>th]:text-left">
              <th className="w-[62px]">Date</th><th className="w-[150px]">Drug, strength, form (brand)</th><th className="w-[58px]">In / Out</th><th>Name &amp; address (supplier or patient)</th><th className="w-[150px]">Prescriber / Rx or invoice no.</th><th className="w-[56px]">Amount</th><th className="w-[70px]">Pharmacist (PSI no.)</th><th className="w-[74px]">Entered in eCDR (date, initials)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 18 }).map((_, i) => (
              <tr key={i} className="h-9 [&>td]:border [&>td]:border-black"><td /><td /><td /><td /><td /><td /><td /><td /></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px]">Running balances are recalculated when the lines are entered. Destructions of Schedule 2 stock still need an authorised witness — record the witness’s name and capacity in the name column.</p>
      </div>
    </div>
  );
}
