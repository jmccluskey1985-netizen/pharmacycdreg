import type { Metadata } from 'next';
import { PublicPage, H2, P, UL } from '@/components/public/public-page';
import { COMPANY } from '@/config/company';
import { PLAN, formatEuro } from '@/config/pricing';

export const metadata: Metadata = { title: 'Terms of service: PharmacyCDReg.ie' };

export default function TermsPage() {
  return (
    <PublicPage title="Terms of service" intro={`Last updated ${COMPANY.updated}. These terms are between ${COMPANY.legalName} (“we”) and the pharmacy business using PharmacyCDReg.ie (“you”).`}>
      <H2>1. The service</H2>
      <P>An electronic Controlled Drug Register and related records for community pharmacies in Ireland, provided online as a subscription.</P>
      <H2>2. Your responsibilities</H2>
      <UL>
        <li>The register is your legal record. You remain responsible for complying with the Misuse of Drugs Regulations, PSI guidance and your own procedures, including checking every entry, including any drafted from a scanned document, before signing it.</li>
        <li>Keep your login, authenticator and staff PINs secure and give each person their own PIN. Remove staff who leave.</li>
        <li>Only record data you are entitled to process, and keep the paper records the law still requires (e.g. prescriptions, invoices, requisitions).</li>
      </UL>
      <H2>3. Data protection</H2>
      <P>For register and patient data you are the controller and we are your processor. Our Data Processing Agreement forms part of these terms; see the <a className="text-primary underline" href="/privacy">privacy notice</a>.</P>
      <H2>4. Price, trial and cancellation</H2>
      <UL>
        <li>A free month, no card needed. Then {formatEuro(PLAN.price)} per month + VAT per premises, billed monthly in advance.</li>
        <li>Cancel any time from Billing; the subscription ends at the end of the paid month.</li>
        <li>If you stop paying, the register becomes read-only. You can still view, print and export it. It is never deleted because of non-payment.</li>
      </UL>
      <H2>5. Availability</H2>
      <P>We aim for the service to be available 24/7 and announce planned maintenance in advance. Keep the paper fallback sheet available for outages and enter those transactions when the service returns.</P>
      <H2>6. Your data when you leave</H2>
      <P>You can export your registers at any time. When you close your account we provide a full export on request, then delete your data after the retention period you choose (at least the period the law requires you to keep the register).</P>
      <H2>7. Liability</H2>
      <P>We provide the service with reasonable skill and care. Nothing in these terms limits liability that can’t be limited by law. Otherwise our total liability in any 12 months is limited to the fees you paid in that period, and we aren’t liable for indirect or consequential loss.</P>
      <H2>8. Changes and law</H2>
      <P>We’ll give 30 days’ notice of material changes to these terms. Irish law applies and the Irish courts have jurisdiction.</P>
      <H2>Contact</H2>
      <P><a className="text-primary underline" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></P>
    </PublicPage>
  );
}
