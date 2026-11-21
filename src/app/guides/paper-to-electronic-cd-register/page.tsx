import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, CalendarDays, ClipboardCheck, BookPlus, PenLine, Users, Pill, FileText } from 'lucide-react';
import { GuideLayout, GH2, Callout } from '@/components/guides/guide-layout';
import { StepTimeline, PaperToDigital } from '@/components/guides/animations';
import { TickList } from '@/components/fade-in';
import { guide } from '@/lib/guides';

const g = guide('paper-to-electronic-cd-register');
export const metadata: Metadata = {
  title: `${g.title} | PharmacyCDReg.ie`, description: g.description, alternates: { canonical: `/guides/${g.slug}` },
  openGraph: { type: 'article', title: g.title, description: g.description, url: `/guides/${g.slug}`, publishedTime: g.published, modifiedTime: g.updated },
};

const STEPS = [
  { name: 'Do your risk assessment', text: 'PSI guidance expects an appropriate risk assessment before you switch to electronic records. Note how you’ll handle access, backups and outages; the system’s data safety sheet covers most of it.' },
  { name: 'Choose a changeover date', text: 'The start of a week or month works well: quieter, and easy to find later. Tell the team.' },
  { name: 'Do a full stock check', text: 'Count every Schedule 2 CD and make sure each paper balance matches the safe before you carry it across.' },
  { name: 'Open each book with its balance brought forward', text: 'Pick your products from the CD list, or photograph the last page of each paper book: the balance is read for you. A pharmacist signs each opening line.' },
  { name: 'Close the paper books properly', text: 'Draw a line under the last entry and write “Continued in electronic register from [date]”, signed and dated. Keep the paper registers for two years from that last entry.' },
  { name: 'Set up the team', text: 'Each person gets their own PIN and role. Technicians draft; pharmacists sign. Turn on two-step sign-in for the pharmacy login.' },
  { name: 'Add your OST patients and contacts', text: 'Add methadone and buprenorphine patients once from their bag labels, and your regular doctors and suppliers, so entries fill themselves in.' },
  { name: 'Keep a paper fallback sheet handy', text: 'Print a few and keep them by the CD cabinet, in case the internet or a computer is down. Enter the lines when you’re back online.' },
];
const ICONS = [ShieldCheck, CalendarDays, ClipboardCheck, BookPlus, PenLine, Users, Pill, FileText].map((I, i) => <I key={i} className="h-5 w-5 text-brand" />);
const TOC = [
  { id: 'before', label: 'Before you start' },
  { id: 'steps', label: 'The changeover, step by step' },
  { id: 'carry-forward', label: 'Carrying balances forward' },
  { id: 'after', label: 'After the changeover' },
];

export default function Page() {
  return (
    <GuideLayout meta={g} toc={TOC} steps={STEPS}>
      <p className="text-xl leading-relaxed text-foreground">Changing from the paper CD book to an electronic register takes an afternoon, not a weekend. The key is a clean stock check on the day, so every balance you carry across is one you’ve counted.</p>

      <GH2 id="before">Before you start</GH2>
<Callout tone="amber" title="Your responsibility">The 2026 changes to the legislation allow electronic CD registers. As the pharmacy, you’re responsible for making sure the system you use meets the legal requirements, and PSI guidance expects a risk assessment before you switch. Use our <a href="/risk-assessment" className="font-semibold underline">ready-made risk assessment template</a>: it’s filled in with how each risk is controlled.</Callout>
      <TickList items={['A quiet hour and a second person', 'Every paper CD book to hand', 'Your phone, to photograph the last pages', 'The team’s names and PSI numbers']} />

      <GH2 id="steps">The changeover, step by step</GH2>
      <StepTimeline steps={STEPS.map((s, i) => ({ title: s.name, text: s.text, icon: ICONS[i] }))} />

      <GH2 id="carry-forward">Carrying balances forward</GH2>
      <p>Each electronic book starts with one line: the balance brought forward from paper, signed by a pharmacist. Photograph the last page of each paper book and the product and balance are read for you to check, or choose products from the CD list and type the balance.</p>
      <PaperToDigital />
      <p>One book per drug, strength and form, just as on paper. Brands stay separate: OxyNorm and Shortec are different books even at the same strength.</p>

      <GH2 id="after">After the changeover</GH2>
      <ul className="list-disc space-y-2 pl-6">
        <li><b>Keep the old paper registers</b> safe for two years from their last entry.</li>
        <li><b>Stock checks carry on as usual</b>, and your dispensing system’s report can now find any missing entries for you (<Link href="/guides/cd-stock-check-touchstore-mps" className="font-semibold text-brand-dark underline">here’s how</Link>).</li>
      </ul>
    </GuideLayout>
  );
}
