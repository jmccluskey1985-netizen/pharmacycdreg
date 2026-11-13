/**
 * Who runs PharmacyCDReg.ie: shown on the privacy, terms and security pages.
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
  { name: 'Google Cloud EMEA Ltd. (Vertex AI)', purpose: 'Reads photos of prescriptions, invoices and register pages with an AI model. Only when you scan', location: 'EU (Vertex AI EU multi-region)', safeguard: 'Cloud Data Processing Addendum; data not used to train models; processed in the EU' },
  { name: 'Stripe Payments Europe Ltd.', purpose: 'Subscription billing (no patient data)', location: 'Ireland / EU', safeguard: 'DPA' },
  { name: 'Google Ireland Ltd. (Workspace)', purpose: 'Sending service emails (no patient data)', location: 'EU', safeguard: 'DPA with SCCs' },
];
