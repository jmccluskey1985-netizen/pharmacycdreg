import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Lock, ShieldCheck, Archive, ScanLine, Eye, KeyRound, Building2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { PublicFooter } from '@/components/public/public-page';
import { COMPANY, SUBPROCESSORS } from '@/config/company';
import { PrintButton } from './print-button';
import { infoPageJsonLd, jsonLd } from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Data safety at a glance | PharmacyCDReg.ie',
  description: 'A one-page summary for superintendent and supervising pharmacists: where register and patient data is kept, who can see it, how the register is protected from changes, backups and inspection.',
  alternates: { canonical: '/data-safety' },
};

/**
 * One printable page for superintendents and supervising pharmacists. Every statement here
 * must stay true of the live system: change it when the system changes (see HANDOVER.md).
 */
const SECTIONS = [
  {
    icon: MapPin, title: 'Where your data is kept',
    points: [
      'In the EU: the database is hosted in the EU and the app’s servers run in Dublin.',
      'Encrypted in transit (HTTPS only) and at rest by our database provider.',
      'Your pharmacy is the data controller. We process the data only to run the register for you.',
    ],
  },
  {
    icon: Lock, title: 'Who can see it',
    points: [
      'Only your pharmacy. Every request is checked on our servers; browsers can’t reach the database directly.',
      'Two locks: the pharmacy login (two-step sign-in available) and each person’s own PIN.',
      'Roles limit what people can do: technicians draft, pharmacists sign. Screens lock when left idle.',
    ],
  },
  {
    icon: ShieldCheck, title: 'The register can’t be quietly changed',
    points: [
      'Lines can’t be edited or deleted, by anyone. A correction is a new line; the original stays visible with a footnote.',
      'Every line is sealed with a fingerprint chained to the one before. Verify integrity checks them all in one click.',
      'A full audit trail records who did what, and when. Late entries carry a footnote with the reason.',
    ],
  },
  {
    icon: Archive, title: 'Backups and outages',
    points: [
      'Download a password-protected full backup at any time (encrypted on your computer; the password never leaves it).',
      'A restore tool rebuilds a pharmacy from that backup and proves every line matches before it finishes.',
      'If the system or internet is down, use the paper fallback sheet and enter it later as a late entry.',
    ],
  },
  {
    icon: ScanLine, title: 'Scanning prescriptions and invoices',
    points: [
      'Photos are read by Google’s Gemini on Vertex AI in the EU, under Google Cloud’s data processing terms. Google doesn’t use them to train models.',
      'Photos aren’t kept after reading: only the details read from them, for a pharmacist to check.',
      'Nothing is recorded until a pharmacist checks it and signs with their PIN.',
      'Patient details are used only to keep your register: never for marketing.',
    ],
  },
  {
    icon: Eye, title: 'Ready for inspection',
    points: [
      'Laid out like the paper register, printable by page, with CSV export.',
      'Time-limited, read-only links for inspectors. Every view is logged.',
      'A weekly email records each register’s latest fingerprint outside the system.',
    ],
  },
  {
    icon: KeyRound, title: 'You stay in control',
    points: [
      'Export everything at any time. If you stop paying, the register stays readable and exportable.',
      'A data processing agreement (DPA) is available to sign.',
      'Only you decide who joins your team, and you can remove access instantly.',
    ],
  },
  {
    icon: Building2, title: 'Groups and superintendents',
    points: [
      'A superintendent over several pharmacies can switch between them with their own login.',
      'They still sign in to each pharmacy with that pharmacy’s PIN, so every entry is signed in the right register.',
      'Each pharmacy’s data stays separate.',
    ],
  },
];

export default function DataSafetyPage() {
  return (
    <main className="data-sheet-page theme-light min-h-screen bg-gradient-to-b from-secondary/70 to-background print:bg-white print:bg-none">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(infoPageJsonLd('/data-safety', 'Data safety at a glance', COMPANY.updatedIso)) }} />
      <header className="border-b border-border bg-card print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/?home=1" aria-label="PharmacyCDReg.ie home"><Logo size="sm" /></Link>
          <nav className="flex gap-3 text-sm text-muted-foreground"><Link href="/security" className="hover:text-foreground">Security</Link><Link href="/privacy" className="hover:text-foreground">Privacy</Link><Link href="/terms" className="hover:text-foreground">Terms</Link></nav>
        </div>
      </header>

      <article className="data-sheet mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="hidden print:block"><Logo size="sm" /></div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand print:mt-2 print:text-[9px]">For superintendent and supervising pharmacists</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-dark print:text-xl">Data safety at a glance</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground print:mt-1 print:text-[10px]">How PharmacyCDReg.ie protects your Controlled Drugs Register and the patient details in it.</p>
          </div>
          <PrintButton />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 print:mt-3 print:grid-cols-2 print:gap-2">
          {SECTIONS.map((s) => (
            <section key={s.title} className="rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border print:break-inside-avoid print:rounded-lg print:p-2.5 print:shadow-none">
              <h2 className="flex items-center gap-2 font-bold print:text-[11px]"><s.icon className="h-5 w-5 flex-shrink-0 text-brand print:h-3.5 print:w-3.5" /> {s.title}</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground print:mt-1 print:space-y-0.5 print:text-[9px] print:leading-snug">
                {s.points.map((p) => <li key={p} className="flex gap-2"><span className="mt-[0.45em] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand print:h-1 print:w-1" />{p}</li>)}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-4 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border print:mt-2 print:break-inside-avoid print:rounded-lg print:p-2.5 print:shadow-none">
          <h2 className="font-bold print:text-[11px]">Companies that process data for us</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm print:min-w-0 print:text-[8.5px]">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground print:text-[7.5px]"><tr><th className="py-1 pr-3">Company</th><th className="py-1 pr-3">What for</th><th className="py-1">Where</th></tr></thead>
              <tbody>{SUBPROCESSORS.map((s) => <tr key={s.name} className="border-t border-border align-top"><td className="py-1.5 pr-3 font-medium print:py-0.5">{s.name}</td><td className="py-1.5 pr-3 text-muted-foreground print:py-0.5">{s.purpose}</td><td className="py-1.5 text-muted-foreground print:py-0.5">{s.location}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <p className="mt-4 text-xs text-muted-foreground print:mt-2 print:text-[8px]">
          Questions or to request our DPA: {COMPANY.email}. Full details: pharmacycdreg.ie/security and pharmacycdreg.ie/privacy. {COMPANY.legalName}. Last updated {COMPANY.updated}.
        </p>
      </article>
      <div className="print:hidden"><PublicFooter /></div>
    </main>
  );
}
