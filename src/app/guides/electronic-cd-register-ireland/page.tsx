import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideLayout, GH2, Callout } from '@/components/guides/guide-layout';
import { RegisterLineAnatomy, TamperChain } from '@/components/guides/animations';
import { TickList } from '@/components/fade-in';
import { guide } from '@/lib/guides';

const g = guide('electronic-cd-register-ireland');
export const metadata: Metadata = {
  title: `${g.title} | PharmacyCDReg.ie`, description: g.description, alternates: { canonical: `/guides/${g.slug}` },
  openGraph: { type: 'article', title: g.title, description: g.description, url: `/guides/${g.slug}`, publishedTime: g.published, modifiedTime: g.updated },
};

const TOC = [
  { id: 'what-it-records', label: 'What an entry records' },
  { id: 'rules', label: 'Rules that don’t change' },
  { id: 'kept-safe', label: 'How electronic keeps it safe' },
  { id: 'before-you-rely', label: 'Before you go paperless' },
  { id: 'questions', label: 'Common questions' },
];

export default function Page() {
  return (
    <GuideLayout meta={g} toc={TOC}>
      <p className="text-xl leading-relaxed text-foreground">Every community pharmacy in Ireland keeps a Controlled Drugs Register for its Schedule 2 drugs. An electronic register records exactly the same things as the paper book. It works out the balances for you, won’t let a line be quietly changed, and is ready the moment an inspector asks.</p>

      <GH2 id="what-it-records">What a register entry records</GH2>
      <p>Each drug has its own part of the register: one page or book for each drug, strength and form (OxyNorm 5mg capsules is separate from OxyNorm 10mg capsules, and from Shortec). Lines go in date order.</p>
      <RegisterLineAnatomy />
      <p>A <b>receipt</b> records the date, the supplier’s name and address, and the amount received. A <b>supply</b> records the date, who it was supplied to (with their address), the authority for it (the prescriber, with their address) and the amount. Each line should be entered on the day, or the next day at the latest.</p>

      <GH2 id="rules">The rules that don’t change when it’s electronic</GH2>
      <TickList items={['Nothing is crossed out, overwritten or deleted', 'Mistakes are corrected with a dated note, original kept', 'Lines go in date order, each signed', 'One register per premises', 'Kept for two years from the last entry', 'Available to an inspector when asked']} />
      <p>Going electronic doesn’t change what the Misuse of Drugs Regulations and PSI guidance expect of the record. It changes how easily you meet them. A correction becomes a new, signed line beside the original. A late entry carries its own footnote with the reason.</p>

      <GH2 id="kept-safe">How an electronic register keeps the record safe</GH2>
      <p>The worry with any computer record is that it could be changed afterwards without anyone knowing. A well-built electronic register makes that impossible to hide:</p>
      <TamperChain />
      <ul className="list-disc space-y-2 pl-6">
        <li><b>Append-only.</b> Lines can’t be edited or deleted, by anyone. The database itself refuses.</li>
        <li><b>Tamper-evident.</b> Each line carries a fingerprint that includes the line before it. Change one and every check after it fails, showing exactly where.</li>
        <li><b>Who did what.</b> Every person signs in with their own PIN, so each line carries their name and PSI number, and every view and export is logged.</li>
        <li><b>Backups you hold.</b> Download a password-protected copy of everything whenever you like.</li>
      </ul>

      <GH2 id="before-you-rely">Before you rely on it instead of paper</GH2>
      <Callout tone="amber" title="Check that you can stop the paper register">
        Electronic CD registers are being introduced in Ireland, with the IPU verifying systems against its eCDR requirements. Before you stop keeping the paper register, confirm with the PSI or the IPU that the change applies to your pharmacy. Until then, you can run an electronic register alongside paper.
      </Callout>
      <p>When choosing a system, ask:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Can lines ever be edited or deleted? (They shouldn’t be.)</li>
        <li>Where is the data kept? (In the EU, under a data processing agreement with your pharmacy.)</li>
        <li>Can you export everything, and can an inspector be given read-only access?</li>
      </ul>

      <GH2 id="questions">Common questions</GH2>
      <div className="space-y-3">
        {[
          ['Do witnessed destructions change?', 'No. Destroying Schedule 2 stock still needs an authorised witness. The electronic register records the destruction with the witness’s name and capacity, and patient returns go in a separate destruction record.'],
          ['Can technicians make entries?', 'They can prepare them. In PharmacyCDReg.ie a technician’s entry is a draft until a pharmacist checks and signs it with their own PIN; it doesn’t change any balance before then.'],
          ['What if the internet goes down?', 'Keep a paper fallback sheet by the CD cabinet. Record on it, then enter each line when you’re back online, with a late-entry footnote.'],
          ['How does an inspector see it?', 'Print or export any book, or give a time-limited, read-only link that you can switch off at any time. Every view is logged.'],
        ].map(([q, a]) => (
          <details key={q} className="group rounded-2xl bg-card p-4 shadow-soft ring-1 ring-border open:ring-brand/30">
            <summary className="cursor-pointer list-none font-semibold marker:hidden">{q}<span className="float-right text-brand transition group-open:rotate-45">+</span></summary>
            <p className="mt-2 text-[16px] text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
      <p>Next: <Link href="/guides/paper-to-electronic-cd-register" className="font-semibold text-brand-dark underline">how to move from paper to electronic, step by step</Link>.</p>
    </GuideLayout>
  );
}
