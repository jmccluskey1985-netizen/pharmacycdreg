import type { Metadata } from 'next';
import { PublicPage, H2, P, UL } from '@/components/public/public-page';
import { COMPANY, SUBPROCESSORS } from '@/config/company';

export const metadata: Metadata = { title: 'Privacy notice — PharmacyCDReg.ie' };

export default function PrivacyPage() {
  return (
    <PublicPage title="Privacy notice" intro={`Last updated ${COMPANY.updated}.`}>
      <H2>Who we are</H2>
      <P>PharmacyCDReg.ie is provided by {COMPANY.legalName}, {COMPANY.address} (“we”). Contact: <a className="text-primary underline" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.</P>

      <H2>Two kinds of data, two roles</H2>
      <UL>
        <li><b>Register and patient data</b> that a pharmacy records (CD transactions, patient and prescriber names and addresses, notes, photos). The <b>pharmacy is the data controller</b>; we are its <b>processor</b> and act only on its instructions under our Data Processing Agreement. Patients with questions about their data should contact the pharmacy.</li>
        <li><b>Account and business data</b> about our customers (pharmacy name and address, login email, staff names and PSI numbers, billing details, support messages, website usage). For this we are the <b>controller</b>.</li>
      </UL>

      <H2>What we use account data for, and why</H2>
      <UL>
        <li>Providing the service and your account — contract (GDPR Art. 6(1)(b)).</li>
        <li>Billing and keeping accounting records — contract and legal obligation (6(1)(b), 6(1)(c)).</li>
        <li>Service emails (trial ending, reminders due, weekly integrity record) — contract.</li>
        <li>Security, audit logs and preventing misuse — legitimate interests (6(1)(f)).</li>
        <li>Anonymous, cookie-free page-view counts to improve the website — legitimate interests.</li>
        <li>Waitlist and product updates — consent, which you can withdraw at any time.</li>
      </UL>
      <P>Register and patient data is health data (Art. 9). Pharmacies process it to meet their obligations under the Misuse of Drugs Regulations and for the provision of health care (Art. 9(2)(h) and (i)). We never use it for any purpose of our own, never sell it and never use it to train AI.</P>

      <H2>Who we share it with</H2>
      <P>Only the sub-processors below, each under a data processing agreement:</P>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="py-1 pr-3">Company</th><th className="py-1 pr-3">What for</th><th className="py-1 pr-3">Where</th><th className="py-1">Safeguards</th></tr></thead>
        <tbody>{SUBPROCESSORS.map((s) => <tr key={s.name} className="border-t border-border align-top"><td className="py-2 pr-3 font-medium">{s.name}</td><td className="py-2 pr-3">{s.purpose}</td><td className="py-2 pr-3">{s.location}</td><td className="py-2">{s.safeguard}</td></tr>)}</tbody></table></div>
      <P>We tell customers before adding a new sub-processor that handles register data.</P>

      <H2>How long we keep it</H2>
      <UL>
        <li>Register data: for as long as the pharmacy’s account exists, and afterwards for the period the pharmacy instructs (CD registers must be kept for at least two years from the last entry). On request we return it in full and then delete it.</li>
        <li>Billing records: 6 years (Revenue requirements).</li>
        <li>Audit and security logs: as long as the register they relate to.</li>
      </UL>

      <H2>Cookies</H2>
      <P>We use only essential cookies: to keep you signed in and to remember which staff member entered their PIN. No advertising or tracking cookies. Website statistics are counted without cookies.</P>

      <H2>Your rights</H2>
      <P>You can ask for access to, correction or deletion of your personal data, restriction of or objection to processing, and data portability. Email {COMPANY.email}. You can also complain to the Data Protection Commission (dataprotection.ie).</P>
    </PublicPage>
  );
}
