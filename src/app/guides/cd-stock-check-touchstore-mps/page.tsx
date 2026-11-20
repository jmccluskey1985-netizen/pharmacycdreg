import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, Package, Scale, FileDown, FileSearch, NotebookPen } from 'lucide-react';
import { GuideLayout, GH2, Callout } from '@/components/guides/guide-layout';
import { StepTimeline, CountCompare } from '@/components/guides/animations';
import { FileImportDemo, BalancesListPreview } from '@/components/landing-demos';
import { guide } from '@/lib/guides';

const g = guide('cd-stock-check-touchstore-mps');
export const metadata: Metadata = {
  title: `${g.title} | PharmacyCDReg.ie`, description: g.description, alternates: { canonical: `/guides/${g.slug}` },
  openGraph: { type: 'article', title: g.title, description: g.description, url: `/guides/${g.slug}`, publishedTime: g.published, modifiedTime: g.updated },
};

const STEPS = [
  { name: 'Pick a quiet time and two people', text: 'One counts, one checks. Print the balances list with count columns so you have the register balance beside each CD.' },
  { name: 'Count every CD in the safe', text: 'Sealed packs by the pack; opened packs tablet by tablet. Measure liquids and note any small overage or shortfall.' },
  { name: 'Compare with the register balance', text: 'Write the count beside each line. Most will match. Mark any that don’t.' },
  { name: 'Get the report from your dispensing system', text: 'Touchstore: the Controlled Drug Report, saved as .QRP or printed. MPS: the Drug Search Report, saved as CSV. Any other system: PDF, CSV or a photo of each page.' },
  { name: 'Upload it and let it find the missing entries', text: 'Registers → Check report reads the whole report against every book. Lines not in the register are highlighted; tick them and sign once.' },
  { name: 'Record the stock check and anything still unexplained', text: 'Record the check in each book. If a difference remains, investigate, note what you found, and follow PSI guidance on reporting losses.' },
];
const ICONS = [<Users key="1" className="h-5 w-5 text-brand" />, <Package key="2" className="h-5 w-5 text-brand" />, <Scale key="3" className="h-5 w-5 text-brand" />, <FileDown key="4" className="h-5 w-5 text-brand" />, <FileSearch key="5" className="h-5 w-5 text-brand" />, <NotebookPen key="6" className="h-5 w-5 text-brand" />];
const TOC = [
  { id: 'at-a-glance', label: 'At a glance' },
  { id: 'steps', label: 'Step by step' },
  { id: 'reports', label: 'Touchstore and MPS reports' },
  { id: 'still-different', label: 'If it still doesn’t match' },
  { id: 'how-often', label: 'How often' },
];

export default function Page() {
  return (
    <GuideLayout meta={g} toc={TOC} steps={STEPS}>
      <p className="text-xl leading-relaxed text-foreground">A CD stock check is simple when the count matches. When it doesn’t, the answer is nearly always a supply that was dispensed but never entered. Your dispensing system already knows what went out, so let it tell you.</p>

      <GH2 id="at-a-glance">At a glance</GH2>
      <CountCompare />

      <GH2 id="steps">Step by step</GH2>
      <StepTimeline steps={STEPS.map((s, i) => ({ title: s.name, text: s.text, icon: ICONS[i] }))} />

      <GH2 id="reports">Using your Touchstore or MPS report</GH2>
      <p>You don’t need to retype anything. Save the report the way your system offers and upload the file, or photograph each printed page.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Callout title="Touchstore">Run the <b>Controlled Drug Report</b> for the period since your last check. Save it (a <b>.QRP</b> file) or print it. A .QRP is read exactly from the file, without the AI reader: the dispensed date, Qty. Disp, script number, patient and prescriber.</Callout>
        <Callout title="MPS">Run the <b>Drug Search Report</b> for the product or period and save it as <b>CSV</b>. The columns (Date Dispensed, Patient Name, Script Dispensed As, Qty) are read exactly, without the AI reader.</Callout>
      </div>
      <FileImportDemo />
      <p>A report covering every CD is checked against every book at once. Each line goes to its own book by product and strength (a brand only ever goes in that brand’s book), and lines for products without a book are listed separately.</p>

      <GH2 id="still-different">If it still doesn’t match</GH2>
      <ul className="list-disc space-y-2 pl-6">
        <li><b>A delivery not entered?</b> Check this week’s CD dockets and invoices against receipts in the book.</li>
        <li><b>Owed or part-supplied?</b> Touchstore shows Qty. Ow’d separately: only what was handed out belongs in the register.</li>
        <li><b>Set aside for destruction?</b> Expired stock stays in the balance until it’s destroyed with a witness.</li>
        <li><b>Still unexplained?</b> Record what you checked in the stock-check notes. Only a pharmacist can amend a balance, with a reason, and the original lines stay. Follow PSI guidance on reporting losses.</li>
      </ul>
      <Callout title="Late entries are fine, if they’re honest">Any line added more than a day after the supply carries a late-entry footnote, such as “not entered on the day; found at the stock check on 20/11/26 by checking the dispensing report”. That’s exactly what an inspector wants to see.</Callout>

      <GH2 id="how-often">How often to check</GH2>
      <p>Choose a frequency that suits your turnover and set it in Settings → Stock checks: the system shows which books are due. Busy lines, such as methadone, are often checked more often than slow movers. A dated balances list makes each check quick:</p>
      <BalancesListPreview />
      <p>New to electronic registers? Start with <Link href="/guides/electronic-cd-register-ireland" className="font-semibold text-brand-dark underline">what an electronic CD register is and what it records</Link>.</p>
    </GuideLayout>
  );
}
