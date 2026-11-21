import type { Metadata } from 'next';
import Link from 'next/link';
import { GuideHeader } from '@/components/guides/guide-layout';
import { PublicFooter } from '@/components/public/public-page';
import { infoPageJsonLd, jsonLd } from '@/lib/structured-data';
import { RiskForm } from '@/components/risk-form';

export const metadata: Metadata = {
  title: 'Risk assessment template: electronic Controlled Drugs Register | PharmacyCDReg.ie',
  description: 'A free, fill-in risk assessment for Irish community pharmacies moving to an electronic CD register: access, integrity, outages, backups, inspection, data protection and changeover, with controls and sign-off.',
  alternates: { canonical: '/risk-assessment' },
};

export default function RiskAssessmentPage() {
  return (
    <main className="theme-light min-h-screen bg-background print:bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(infoPageJsonLd('/risk-assessment', 'Risk assessment template: electronic Controlled Drugs Register', '2026-11-21')) }} />
      <div className="print:hidden"><GuideHeader /></div>
      <section className="border-b border-border bg-gradient-to-b from-secondary/80 to-background print:border-0 print:bg-none">
        <div className="mx-auto max-w-5xl px-4 py-10 print:py-2">
          <p className="inline-flex rounded-full bg-brand/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-dark print:hidden">Free template</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl print:mt-0 print:text-2xl">Risk assessment: introducing an electronic Controlled Drugs Register</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground print:text-sm">PSI guidance expects those in a statutory governance role to carry out a risk assessment before adopting electronic record-keeping: identifying risks that could arise during and after the change, with remedial actions to reduce them. This template is filled in with how PharmacyCDReg.ie controls each risk, organised under the IPU eCDR requirement areas. Add your own local controls, rate each risk, and sign it off.</p>
          <p className="mt-3 rounded-xl bg-brand/10 p-3 text-sm print:hidden"><b>Using PharmacyCDReg.ie?</b> Yours is ready-made in your dashboard (Settings → Risk assessment), filled in from your pharmacy’s details and signed with one click.</p>
          <p className="mt-3 text-xs text-muted-foreground print:hidden">Using another system? The risks and checklist still apply; replace the “how the system controls it” points with your supplier’s answers. See also <Link href="/data-safety" className="underline">Data safety at a glance</Link> and the <Link href="/guides/paper-to-electronic-cd-register" className="underline">changeover guide</Link>.</p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-4 py-8 print:py-2"><RiskForm /></div>
      <div className="mx-auto max-w-5xl px-4 pb-10 text-xs text-muted-foreground">A template to adapt to your pharmacy, not legal advice. Check it against the current PSI Guidelines on Record-Keeping and the Misuse of Drugs Regulations as amended in 2026.</div>
      <div className="print:hidden"><PublicFooter /></div>
    </main>
  );
}
