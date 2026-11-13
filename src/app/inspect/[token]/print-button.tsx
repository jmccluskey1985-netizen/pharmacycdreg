'use client';
import { Printer } from 'lucide-react';
export function PrintButton() {
  return <button onClick={() => window.print()} className="btn-secondary"><Printer className="h-4 w-4" /> Print / save PDF</button>;
}
