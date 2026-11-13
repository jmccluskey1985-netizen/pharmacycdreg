/**
 * Who runs PharmacyCDReg.ie — shown on the privacy, terms and security pages.
 * Set these in Vercel (they're public, not secrets). Until then the placeholders show.
 */
export const COMPANY = {
  legalName: process.env.NEXT_PUBLIC_COMPANY_NAME || 'PharmacyCDReg.ie (operator name to be confirmed)',
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || 'Ireland',
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'support@pharmacycdreg.ie',
  updated: '13 November 2026',
};

/** Companies that process data on our behalf (GDPR Art. 28 sub-processors). */
export const SUBPROCESSORS = [
  { name: 'Supabase Inc.', purpose: 'Database, sign-in and file storage (register, patients, notes, photos)', location: 'EU (Ireland / Frankfurt region)', safeguard: 'EU hosting; DPA with Standard Contractual Clauses' },
  { name: 'Vercel Inc.', purpose: 'Web hosting and the app’s servers', location: 'Servers pinned to Dublin (dub1)', safeguard: 'DPA with Standard Contractual Clauses' },
  { name: 'OpenRouter, Inc.', purpose: 'Routes photos of prescriptions / invoices to an AI reading model — only when you scan', location: 'USA / model provider', safeguard: 'Zero-data-retention endpoints only: nothing is stored or used for training; DPA with SCCs' },
  { name: 'Stripe Payments Europe Ltd.', purpose: 'Subscription billing (no patient data)', location: 'Ireland / EU', safeguard: 'DPA' },
  { name: 'Google Ireland Ltd. (Workspace)', purpose: 'Sending service emails (no patient data)', location: 'EU', safeguard: 'DPA with SCCs' },
];
