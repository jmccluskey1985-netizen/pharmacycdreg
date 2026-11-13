'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search } from 'lucide-react';

const GUIDES: { title: string; tags: string; steps: (string | JSX.Element)[]; link?: { href: string; label: string } }[] = [
  { title: 'Record a supply from a prescription', tags: 'scan rx dispense supply', steps: ['Tap Scan Rx (top of every page).', 'Photograph the prescription: it reads the patient, prescriber, drug and quantity.', 'Check every field against the prescription, then Sign & record. Nothing is recorded until you sign.'], link: { href: '/dashboard/scan?type=prescription', label: 'Scan Rx' } },
  { title: 'Book in a delivery (invoice / CD docket)', tags: 'invoice receipt wholesaler uniphar united drug pco', steps: ['New entry → From an invoice → Photograph the invoice.', 'It works out packs × pack size and picks up the invoice number (not your account number).', 'Check each line and sign. The same invoice can’t be booked in twice.'] },
  { title: 'Type an entry by hand', tags: 'manual entry type', steps: ['Open the drug’s register and click the next empty row (or New entry).', 'Start typing a patient, doctor or supplier, known ones fill in automatically.', 'Check the balance preview, then Sign & record.'] },
  { title: 'Correct a mistake', tags: 'correction wrong error amend', steps: ['On the register, click the pencil on the wrong line.', 'Enter the right details and the reason.', 'The original stays visible, struck through, with a footnote, that’s what the law requires.'] },
  { title: 'Repeat supplies (weekly scripts)', tags: 'repeat weekly reminder methadone', steps: ['On the register, click the supply rows to select them.', 'Repeat for today records them again (enter the new Rx number), or Set up reminder makes a daily / weekly / monthly reminder.', 'When a reminder is due you’ll see it on every page; one click records it.'], link: { href: '/dashboard/reminders', label: 'Reminders' } },
  { title: 'Stock check and discrepancies', tags: 'stock check count balance discrepancy adjust', steps: ['On the register: Stock check → count the CD safe (include stock set aside for destruction).', 'If it doesn’t match, recount and look at recent entries, invoices and prescriptions first.', 'Still wrong? Amend balance adds a signed stock-adjustment line with what you found, and can save it as a note with photos.'] },
  { title: 'Expired stock and destructions', tags: 'expired destruction quarantine witness', steps: ['Expired Schedule 2 stock: Set aside on the register. It stays in the balance, labelled in the CD safe.', 'When an authorised witness attends: Destructions → tick the items → Record witnessed destruction.', 'Patient returns and expired Sch 3/4 stock go in the separate CD Destruction Record Book.'], link: { href: '/dashboard/destructions', label: 'Destructions' } },
  { title: 'An inspection', tags: 'inspection inspector psi audit print', steps: ['Audit trail → Verify integrity shows the register hasn’t been altered.', 'Audit trail → Inspector access creates a read-only link that expires on its own.', 'Every register prints (or saves as PDF) in the statutory layout with page numbers.'], link: { href: '/dashboard/audit', label: 'Audit trail' } },
  { title: 'If the system or internet is down', tags: 'offline down outage paper fallback', steps: ['Print the paper fallback sheet (keep a few by the CD safe).', 'Record transactions on it as you would in a paper register.', 'When it’s back, enter each line: older than a day, it asks for a reason: “entered from paper fallback sheet”.'], link: { href: '/dashboard/fallback-sheet', label: 'Paper fallback sheet' } },
  { title: 'Practise without changing anything', tags: 'training practice', steps: ['Training mode (bottom of the menu) gives you a copy of your registers with an orange bar.', 'Try anything: refresh the page and it’s all gone.'] },
  { title: 'Staff, PINs and locums', tags: 'team staff pin locum', steps: ['Team: add each person with their PSI number and their own PIN.', 'Locums get an end date; their access stops automatically.', 'The screen locks after a few minutes; anyone can tap Lock / switch user.'], link: { href: '/dashboard/team', label: 'Team' } },
  { title: 'Backups and your data', tags: 'backup export data continuity', steps: ['Settings → Data: export every register (CSV) or a full backup (JSON).', 'Keep a monthly full backup somewhere safe outside the pharmacy system. It contains patient details.', 'Your register is never deleted, even if a subscription ends.'], link: { href: '/dashboard/settings', label: 'Settings' } },
];

export default function HelpPage() {
  const [q, setQ] = useState('');
  const shown = GUIDES.filter((g) => !q || `${g.title} ${g.tags}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Help</h1>
        <p className="text-sm text-muted-foreground">One-minute guides. Can’t find it? Ask in <Link href="/dashboard/feedback" className="font-semibold text-primary underline">Feedback &amp; ideas</Link>.</p>
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="input pl-9" placeholder="Search, e.g. correction, destruction, inspection" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((g) => (
          <details key={g.title} className="card group p-4" open={!!q}>
            <summary className="cursor-pointer list-none font-semibold">{g.title}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            {g.link && <Link href={g.link.href} className="mt-2 inline-block text-sm font-semibold text-primary underline">{g.link.label} →</Link>}
          </details>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">No guide matches: try another word.</p>}
      <p className="text-xs text-muted-foreground">Also see <Link href="/security" className="underline">Security</Link>, <Link href="/privacy" className="underline">Privacy</Link> and <Link href="/terms" className="underline">Terms</Link>.</p>
    </div>
  );
}
