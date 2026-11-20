'use client';

import Link from 'next/link';
import { OstOnboardDemo } from '@/components/ost-onboard-demo';
import { useState } from 'react';
import { Search } from 'lucide-react';

const GUIDES: { title: string; tags: string; steps: (string | React.JSX.Element)[]; link?: { href: string; label: string }; visual?: React.ReactNode }[] = [
  { title: 'Record a supply from a prescription', tags: 'scan rx dispense supply', steps: ['Tap Scan Rx (top of every page).', 'Photograph the prescription: it reads the patient, prescriber, drug and quantity.', 'Check every field against the prescription, then Sign & record. Nothing is recorded until you sign.'], link: { href: '/dashboard/scan?type=prescription', label: 'Scan Rx' } },
  { title: 'Use the scanner on your PC instead of a photo', tags: 'scanner scan pc computer desktop folder pdf invoice prescription', steps: [
    'Open Scan Rx in Chrome or Edge on the PC that has the scanner.',
    'Under Scanner on this computer, click Connect scanner folder and choose the folder your scanner saves to (e.g. Pictures › Scans or Documents › Scanned Documents; your scanner app’s settings show it).',
    'Set the scanner to save as PDF or JPEG. If Chrome asks, choose Allow on every visit.',
    'Now just press Scan on the scanner: a prescription is read as soon as it lands; invoice pages are added one by one, then click Read.',
    'You can also drag a scanned file onto the page, or paste it with Ctrl+V. Files in the folder are never changed or deleted.',
  ] },
  { title: 'Book in a delivery (invoice / CD docket)', tags: 'invoice receipt wholesaler uniphar united drug pco', steps: ['New entry → From an invoice → Photograph the invoice.', 'It works out packs × pack size and picks up the invoice number (not your account number).', 'Check each line and sign. The same invoice can’t be booked in twice.'] },
  { title: 'Type an entry by hand', tags: 'manual entry type', steps: ['Open the drug’s register and click the next empty row (or New entry).', 'Start typing a patient, doctor or supplier, known ones fill in automatically.', 'Check the balance preview, then Sign & record.'] },
  { title: 'Correct a mistake', tags: 'correction wrong error amend', steps: ['On the register, click the pencil on the wrong line.', 'Enter the right details and the reason.', 'The original stays visible, struck through, with a footnote, that’s what the law requires.'] },
  { title: 'Repeat supplies (weekly scripts)', tags: 'repeat weekly reminder methadone', steps: ['On the register, click the supply rows to select them.', 'Repeat for today records them again (enter the new Rx number), or Set up reminder makes a daily / weekly / monthly reminder.', 'When a reminder is due you’ll see it on every page; one click records it.'], link: { href: '/dashboard/reminders', label: 'Reminders' } },
  { title: 'Set up your methadone / buprenorphine (OST) patients', tags: 'ost methadone buprenorphine substitution bag label onboard treatment card pmr code identify handwriting', steps: [
    'Do this once, at the start: it means OST forms are matched to the right patient even when the handwriting or address on the form is hard to read.',
    'Patients → From bag labels (or the step in Getting started).',
    'Lay out one printed bag label per OST patient (from your dispensing system) and photograph them, several per photo is fine.',
    'It reads each name, address and the code in brackets after the name, e.g. (F12): that is the patient’s code in your dispensing system.',
    'Choose the product for everyone (e.g. Methadone DTF), change any patient on a different product, and add the treatment card number (PH…) from their HSE card if you have it.',
    'Check each row is linked to the right existing patient, or will be added as new, then Save to the OST list.',
    'From then on, scanning an OST form matches the patient by treatment card or dispensing code first, so an unclear name or missing address doesn’t matter.',
    'New patient later? Add them the same way, or open their record → OST section and tick OST patient. Patients → OST patients shows the list.',
  ], link: { href: '/dashboard/patients?ost=labels', label: 'Add OST patients from bag labels' }, visual: <OstOnboardDemo compact /> },
  { title: 'Stock check and discrepancies', tags: 'stock check count balance discrepancy adjust', steps: ['On the register: Stock check → count the CD safe (include stock set aside for destruction).', 'If it doesn’t match, recount and look at recent entries, invoices and prescriptions first.', 'Still wrong? Amend balance adds a signed stock-adjustment line with what you found, and can save it as a note with photos.'] },
  { title: 'Check a whole dispensing report against every book', tags: 'report all registers books missing entries touchstore mps qrp excel csv pages', steps: ['Registers → Check report.', 'Add a photo of each page, or the saved report file in any format (PDF, Excel, CSV, HTML, Touchstore .QRP). Up to 10 at a time.', 'Each book with missing lines is shown: tick the ones to add and sign once per book. Lines over 24 hours old get the late-entry footnote.'], link: { href: '/dashboard/report-check', label: 'Check report' } },
  { title: 'Stock check: find missing entries from a dispensing report', tags: 'stock check report reconcile missing entries dispensing system late footnote', steps: [
    'Print or export a CD report for this drug from your dispensing system (PDF, photo or CSV).',
    'On the register: Stock check → enter your count → Upload report.',
    'Each report line is checked against the register: found ✓, missing (highlighted) or quantity differs (to check yourself).',
    'Tick or untick the missing ones; fill in any address the report doesn’t have.',
    'Anything over 24 hours old is a late entry: edit the footnote if you like (it’s added to each late line).',
    'Sign & add: they go in as normal signed lines (nothing is overwritten). Then recount if the balance still differs.',
  ] },
  { title: 'Expired stock and destructions', tags: 'expired destruction quarantine witness', steps: ['Print or export the drug search report from your dispensing system (Touchstore, MPS or any other) for the product. ', 'Expired Schedule 2 stock: Set aside on the register. It stays in the balance, labelled in the CD safe.', 'When an authorised witness attends: Destructions → tick the items → Record witnessed destruction.', 'Patient returns and expired Sch 3/4 stock go in the separate CD Destruction Record Book.'], link: { href: '/dashboard/destructions', label: 'Destructions' } },
  { title: 'An inspection', tags: 'inspection inspector psi audit print', steps: ['Audit trail → Verify integrity shows the register hasn’t been altered.', 'Audit trail → Inspector access creates a read-only link that expires on its own.', 'Every register prints (or saves as PDF) in the statutory layout with page numbers.'], link: { href: '/dashboard/audit', label: 'Audit trail' } },
  { title: 'Print all CD balances', tags: 'balances list stock count audit sheet print excel last checked', steps: ['Registers → Balances list: every open book with its balance now and when its stock was last checked, dated.', 'Print it, save as PDF, or download for Excel. Tick “Add columns” for a sheet to write a count on.', 'Any difference: open that book → Stock check, and record it with the reason.'], link: { href: '/dashboard/stock-sheet', label: 'Balances list' } },
  { title: 'If the system or internet is down', tags: 'offline down outage paper fallback', steps: ['Print the paper fallback sheet (keep a few by the CD safe).', 'Record transactions on it as you would in a paper register.', 'When it’s back, enter each line: older than a day, it asks for a reason: “entered from paper fallback sheet”.'], link: { href: '/dashboard/fallback-sheet', label: 'Paper fallback sheet' } },
  { title: 'Practise without changing anything', tags: 'training practice', steps: ['Training mode (bottom of the menu) gives you a copy of your registers with an orange bar.', 'Try anything: refresh the page and it’s all gone.'] },
  { title: 'Technicians: draft entries for a pharmacist to sign', tags: 'technician draft sign off confirm permissions roles settings', steps: [
    'A technician opens a register and clicks Draft entry (or scans an Rx or invoice): it’s saved as a draft and doesn’t change the balance.',
    'Drafts wait in To confirm. A pharmacist clicks Check & sign, checks the details and signs with their PIN. The line notes who drafted it.',
    'Or Turn down, with a reason; the technician can also withdraw their own draft.',
    'The superintendent or supervising pharmacist chooses what each role may do in Settings → Roles & permissions (e.g. let technicians do stock checks, or not).',
  ], link: { href: '/dashboard/settings?tab=roles', label: 'Roles & permissions' } },
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
          <details key={g.title} className={`card group p-4 ${g.visual ? 'md:col-span-2' : ''}`} open={!!q || !!g.visual}>
            <summary className="cursor-pointer list-none font-semibold">{g.title}</summary>
            {g.visual && <div className="mt-3">{g.visual}</div>}
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
