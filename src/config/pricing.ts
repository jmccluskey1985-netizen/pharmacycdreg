// Single source of truth for PharmacyCDReg pricing. Don't hard-code prices elsewhere.
export const PLAN = {
  name: 'PharmacyCDReg',
  price: 19, // EUR/month — limited-time launch price
  originalPrice: 29, // shown struck through
  period: 'month',
  launchOffer: true,
};

export const FREE_TRIAL_DAYS = 30;

export const PLAN_FEATURES = [
  'Unlimited registers, entries and staff',
  'Snap wholesaler invoices — CD lines read for you',
  'Corrections that never hide the original',
  'Search, print & export for inspection',
  'Witnessed destruction record & audit trail',
  'Works alongside any dispensing system',
];

export const formatEuro = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
