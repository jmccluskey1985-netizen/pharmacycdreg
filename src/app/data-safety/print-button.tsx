'use client';
import { Printer } from 'lucide-react';

/** Print, or "Save as PDF" in the print dialog, to email the sheet. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary print:hidden">
      <Printer className="h-4 w-4" /> Print or save as PDF
    </button>
  );
}
