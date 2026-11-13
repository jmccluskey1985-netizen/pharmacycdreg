import type { Metadata } from 'next';
import { PublicPage, H2, P, UL } from '@/components/public/public-page';
import { COMPANY } from '@/config/company';

export const metadata: Metadata = { title: 'Security — PharmacyCDReg.ie', description: 'How PharmacyCDReg.ie protects your Controlled Drug Register and patient data.' };

export default function SecurityPage() {
  return (
    <PublicPage title="Security & data protection" intro="Your CD register is a legal record with patient data in it. This is how we look after it.">
      <H2>Your data stays in the EU</H2>
      <UL>
        <li>The database (registers, patients, notes, photos) is hosted in the EU.</li>
        <li>The app’s servers run in Dublin.</li>
        <li>Prescription and invoice photos you choose to scan are read by an AI model over a zero-data-retention connection: nothing is stored by the model provider or used for training.</li>
      </UL>
      <H2>A register that can’t be quietly changed</H2>
      <UL>
        <li><b>Append-only.</b> Register lines and the audit trail can’t be edited or deleted — the database itself refuses. Mistakes are corrected with a new, signed correction line; the original stays visible.</li>
        <li><b>Tamper-evident.</b> Every line is sealed with a SHA-256 fingerprint of its contents and the line before it. “Verify integrity” recomputes them all and shows the first line that doesn’t match. A weekly email records the latest fingerprints outside the system.</li>
        <li><b>Every action is logged</b> — entries, views, exports, sign-ins, failed PINs, setting changes — with who and when.</li>
      </UL>
      <H2>Who can get in</H2>
      <UL>
        <li>Pharmacy login with password and optional (or required) two-step sign-in with an authenticator app.</li>
        <li>Each person then signs in with their own PIN; every entry carries their name and PSI number. The screen locks after a few minutes without use.</li>
        <li>Roles: supervising pharmacist, pharmacist, locum (with an end date), technician (drafts only), read-only.</li>
        <li>Inspectors can be given a time-limited, read-only link that you can revoke at any time.</li>
        <li>The database can only be reached through the app’s server, which checks the login and PIN on every request.</li>
      </UL>
      <H2>In transit and at rest</H2>
      <UL>
        <li>HTTPS everywhere (HSTS), strict content-security and framing policies.</li>
        <li>Data encrypted at rest by our hosting providers; stored API keys are additionally encrypted (AES-256-GCM).</li>
        <li>PINs are stored only as salted hashes.</li>
      </UL>
      <H2>Backups and continuity</H2>
      <UL>
        <li>Daily database backups by our hosting provider, kept off the live system.</li>
        <li>You can download every register (CSV) or a full backup (JSON) whenever you like.</li>
        <li>If the system or internet is down, print the paper fallback sheet; lines entered afterwards are flagged as late entries with the reason.</li>
        <li>If your subscription ends, the register becomes read-only — never deleted.</li>
      </UL>
      <H2>Report a security concern</H2>
      <P>Email <a className="text-primary underline" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. We take every report seriously and respond as quickly as we can.</P>
    </PublicPage>
  );
}
