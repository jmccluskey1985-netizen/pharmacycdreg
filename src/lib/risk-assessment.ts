/**
 * Risk assessment template for introducing an electronic Controlled Drugs Register.
 * PSI guidance expects those in a statutory governance role to assess the risks of the change
 * (during and after implementation) with remedial actions, before adopting electronic records.
 * Each risk maps to the IPU eCDR requirement areas (FR / NFR) and says how PharmacyCDReg.ie
 * controls it; the pharmacy adds its own local controls, rating and owner.
 */
export interface Risk { id: string; area: string; risk: string; system: string[]; local: string; ipu: string; likelihood: 'Low' | 'Medium' | 'High'; impact: 'Low' | 'Medium' | 'High' }

export const RISKS: Risk[] = [
  {
    id: 'access', likelihood: 'Low', impact: 'High', area: 'Access and security', ipu: 'NFR1–NFR3, FR17',
    risk: 'Someone without authority views or makes register entries (shared logins, a leaver’s access, an unlocked screen).',
    system: ['Pharmacy login with optional or required two-step sign-in', 'Each person signs with their own PIN; every line carries their name and PSI number', 'Roles: technicians draft, only pharmacists sign; locum access ends on a set date', 'Screen locks when idle; failed PINs are limited and logged'],
    local: 'PINs never shared. Leavers removed on their last day. Two-step sign-in turned on for the pharmacy login. Screens locked when stepping away.',
  },
  {
    id: 'alteration', likelihood: 'Low', impact: 'High', area: 'Integrity of the record', ipu: 'FR10–FR12, NFR4–NFR5',
    risk: 'An entry is changed or deleted after it is made, or a correction hides the original.',
    system: ['Lines can’t be edited or deleted: the database refuses', 'Corrections are new, signed lines; the original stays visible with a footnote', 'Every line is sealed with a fingerprint chained to the line before; “Verify integrity” checks them all', 'A weekly email records each register’s latest fingerprint outside the system'],
    local: 'Supervising pharmacist runs “Verify integrity” monthly and keeps the weekly integrity emails.',
  },
  {
    id: 'accuracy', likelihood: 'Low', impact: 'Medium', area: 'Accuracy of entries', ipu: 'FR2, FR5, FR9',
    risk: 'An entry is incomplete or wrong (wrong product, strength, patient, prescriber or quantity), or goes in the wrong book.',
    system: ['Mandatory fields enforced before an entry can be saved', 'One book per product, strength, form and brand; a brand only goes in its own book', 'Duplicate checks on invoice and prescription numbers', 'Scanned prescriptions and invoices are proposals only: a pharmacist checks and signs each one'],
    local: 'Check every scanned entry against the original document before signing. Staff trained before go-live.',
  },
  {
    id: 'balance', likelihood: 'Medium', impact: 'Medium', area: 'Running balances and missed entries', ipu: 'FR3, FR12, FR20',
    risk: 'A supply or receipt isn’t entered, so the balance doesn’t match the stock.',
    system: ['Running balance worked out after every line; never typed in', 'A balance below zero is refused', 'Stock check reminders by your chosen frequency', 'A dispensing report (Touchstore, MPS or any other) can be checked against every book to find missing entries'],
    local: 'Stock checks at the agreed frequency, with the dispensing report used to find any missing entries.',
  },
  {
    id: 'timeliness', likelihood: 'Medium', impact: 'Low', area: 'Timeliness', ipu: 'FR9',
    risk: 'Entries aren’t made on the day of the transaction.',
    system: ['Entries more than a day late must give a reason, shown as a dated footnote on the line', 'To confirm inbox lists drafts and dispensings waiting to be signed'],
    local: 'Entries made at the time of supply or receipt; To confirm cleared before close of business.',
  },
  {
    id: 'outage', likelihood: 'Low', impact: 'Medium', area: 'System or internet outage', ipu: 'NFR10, NFR12',
    risk: 'The register can’t be reached because of an internet, power or computer failure.',
    system: ['Works on any computer, tablet or phone with a browser (e.g. a phone on mobile data)', 'Printable paper fallback sheet, entered later with a late-entry footnote', 'Service status monitored'],
    local: 'Fallback sheets printed and kept by the CD cabinet. A phone or tablet on mobile data available as a backup device.',
  },
  {
    id: 'loss', likelihood: 'Low', impact: 'High', area: 'Data loss and recovery', ipu: 'NFR15–NFR16',
    risk: 'Register data is lost or damaged.',
    system: ['Data held by the hosting provider with regular backups', 'Download a password-protected full backup at any time', 'A restore tool rebuilds the register from a backup and checks every fingerprint'],
    local: 'Full backup downloaded monthly and kept somewhere secure outside the pharmacy system.',
  },
  {
    id: 'inspection', likelihood: 'Low', impact: 'Medium', area: 'Inspection and retrieval', ipu: 'FR15–FR16, NFR10–NFR14',
    risk: 'Records can’t be produced promptly for an authorised officer, or can’t be found.',
    system: ['Any book printed or saved as PDF in the paper layout; CSV export', 'Time-limited, read-only inspector link, every view logged', 'Search by drug, patient, prescriber and date'],
    local: 'At least one person on every shift knows how to print a book and create an inspector link.',
  },
  {
    id: 'retention', likelihood: 'Low', impact: 'Medium', area: 'Retention', ipu: 'NFR6–NFR9',
    risk: 'Records aren’t kept for the required period, or become unreadable if the service ends.',
    system: ['Records are kept; nothing is deleted', 'If a subscription ends, the register stays readable and exportable', 'Full export of every register at any time'],
    local: 'Paper registers kept for two years from their last entry. Export kept if the pharmacy ever changes system.',
  },
  {
    id: 'privacy', likelihood: 'Low', impact: 'High', area: 'Data protection (GDPR)', ipu: 'NFR1–NFR3',
    risk: 'Patient data is disclosed, processed outside the EU or used for another purpose.',
    system: ['Data hosted in the EU; encrypted in transit and at rest', 'Data processing agreement with the pharmacy; published list of sub-processors', 'Scans read by Google Vertex AI in the EU under Google’s data processing terms; not used to train AI; photos not stored', 'Patient data never used for marketing'],
    local: 'Data processing agreement signed and kept. Privacy notice and DPIA updated to mention the electronic register.',
  },
  {
    id: 'changeover', likelihood: 'Low', impact: 'Medium', area: 'Changeover from paper', ipu: 'FR1, FR13',
    risk: 'Balances carried forward are wrong, or the paper and electronic records overlap or leave a gap.',
    system: ['Each book opens with a signed balance brought forward', 'Balances can be read from a photo of the last paper page, checked before signing', 'Only one live register per product'],
    local: 'Full stock check on the changeover day. Paper books closed with “Continued in electronic register from [date]”, signed and dated.',
  },
  {
    id: 'training', likelihood: 'Medium', impact: 'Medium', area: 'Staff training and competence', ipu: 'FR17',
    risk: 'Staff use the system incorrectly.',
    system: ['Training mode: a practice copy of the register that changes nothing', 'Short help guides in the app', 'Technicians’ entries wait for a pharmacist to sign'],
    local: 'Every staff member completes a training-mode session before go-live. Training recorded.',
  },
  {
    id: 'supplier', likelihood: 'Low', impact: 'Medium', area: 'Supplier and software changes', ipu: '—',
    risk: 'The supplier changes the software, or stops trading.',
    system: ['Changes that affect the register are declared to customers', 'Full export and backups remain in the pharmacy’s hands'],
    local: 'Review the supplier’s change notices. Keep recent backups.',
  },
];

export const LEVELS = ['Low', 'Medium', 'High'] as const;
export type Level = (typeof LEVELS)[number] | '';
/** Likelihood × impact → overall rating. */
export function rating(l: Level, i: Level): Level {
  if (!l || !i) return '';
  const n = (LEVELS.indexOf(l) + 1) * (LEVELS.indexOf(i) + 1);
  return n >= 6 ? 'High' : n >= 3 ? 'Medium' : 'Low';
}

export const PLAN = [
  { key: 'assessment', label: 'Risk assessment completed and signed before the changeover' },
  { key: 'dpa', label: 'Data processing agreement with the supplier signed' },
  { key: 'pins', label: 'Every staff member set up with their own PIN and role' },
  { key: 'twofa', label: 'Two-step sign-in turned on for the pharmacy login' },
  { key: 'training', label: 'Training-mode session completed by all staff' },
  { key: 'stockcheck', label: 'Full stock check done on the changeover day' },
  { key: 'books', label: 'Each book opened with a signed balance brought forward' },
  { key: 'paperclosed', label: 'Paper books closed: “Continued in electronic register from [date]”, signed and dated' },
  { key: 'fallback', label: 'Paper fallback sheets printed and kept by the CD cabinet' },
  { key: 'paperkept', label: 'Paper registers stored for two years from their last entry' },
  { key: 'monthly', label: 'Monthly backup download and integrity check scheduled' },
];

export type Row = { local: string; likelihood: Level; impact: Level; owner: string };
export type RiskState = { head: Record<string, string>; rows: Record<string, Row>; plan: Record<string, boolean>; sign: Record<string, string> };
/** A new assessment: every answer filled in with the suggested controls and ratings. */
export function freshRisk(head: Record<string, string> = {}, plan: Record<string, boolean> = {}): RiskState {
  return { head, rows: Object.fromEntries(RISKS.map((r) => [r.id, { local: r.local, likelihood: r.likelihood, impact: r.impact, owner: '' }])), plan, sign: {} };
}
