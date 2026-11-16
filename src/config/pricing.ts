// Single source of truth for PharmacyCDReg pricing. Don't hard-code prices elsewhere.
export const PLAN = {
  name: 'PharmacyCDReg',
  price: 19, // EUR/month: limited-time launch price
  originalPrice: 29, // shown struck through
  period: 'month',
  launchOffer: true,
};

/**
 * Groups (one superintendent or owner, several premises): every pharmacy after the first is 25%
 * off, rounded to whole euros. 10 or more pharmacies: priced with us directly. Groups that join
 * during the launch offer keep the launch prices.
 */
export const GROUP = {
  discountPercent: 25,
  additionalPrice: 14, // EUR/month per additional pharmacy at the launch price (25% off €19, rounded)
  additionalOriginalPrice: 22, // 25% off €29, rounded
  contactFrom: 10,
};

export const FREE_TRIAL_DAYS = 30;

export const PLAN_FEATURES = [
  'Unlimited registers, entries and staff',
  'Photograph wholesaler invoices: CD lines read for you',
  'Corrections that never hide the original',
  'Search, print & export for inspection',
  'Witnessed destruction record & audit trail',
  'Works alongside any dispensing system',
];

export const formatEuro = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
