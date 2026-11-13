import { COMPANY } from '@/config/company';
import { PLAN } from '@/config/pricing';

const SITE = 'https://pharmacycdreg.ie';

/**
 * schema.org JSON-LD for the public pages. Honest by design: only facts that are true of the
 * product today: no ratings or reviews, no regulator endorsement, the real price (ex VAT),
 * and pre-launch availability while the waitlist is open.
 */
export function homepageJsonLd() {
  const org = {
    '@type': 'Organization',
    '@id': `${SITE}/#organization`,
    name: 'PharmacyCDReg.ie',
    url: SITE,
    logo: `${SITE}/icon-512.png`,
    email: COMPANY.email,
    areaServed: { '@type': 'Country', name: 'Ireland' },
    description: 'Independent provider of an electronic Controlled Drugs Register for Irish community pharmacies. Not affiliated with the PSI, the HSE or the IPU.',
  };
  const app = {
    '@type': 'WebApplication',
    '@id': `${SITE}/#software`,
    name: 'PharmacyCDReg.ie',
    alternateName: 'PharmacyCDReg.ie Electronic Controlled Drug Register',
    url: SITE,
    applicationCategory: 'HealthApplication',
    applicationSubCategory: 'Electronic Controlled Drugs Register (eCDR) for pharmacies',
    operatingSystem: 'Any modern web browser (Windows, macOS, iOS, Android)',
    browserRequirements: 'Requires JavaScript and an internet connection',
    inLanguage: 'en-IE',
    countriesSupported: 'IE',
    description: 'Digital Controlled Drugs Register for Irish community pharmacies: records receipts, supplies and witnessed destructions of Schedule 2 controlled drugs with running balances, a tamper-evident audit trail and inspection-ready reports.',
    featureList: [
      'Running balances calculated automatically',
      'Append-only register: corrections never overwrite the original entry',
      'Tamper-evident audit trail with integrity verification',
      'AI-assisted reading of wholesaler invoices and prescriptions, always checked and signed by a pharmacist',
      'Witnessed destruction record and a separate CD destruction record book',
      'Read-only, time-limited access links for inspectors',
      'Individual staff PINs, roles and optional two-step sign-in',
      'Data hosted in the European Union',
    ],
    audience: { '@type': 'MedicalAudience', audienceType: 'Community pharmacists and pharmacy staff in Ireland', geographicArea: { '@type': 'Country', name: 'Ireland' } },
    offers: {
      '@type': 'Offer',
      url: SITE,
      price: PLAN.price.toFixed(2),
      priceCurrency: 'EUR',
      availability: 'https://schema.org/PreOrder',
      eligibleRegion: { '@type': 'Country', name: 'Ireland' },
      priceSpecification: { '@type': 'UnitPriceSpecification', price: PLAN.price.toFixed(2), priceCurrency: 'EUR', unitText: 'MONTH', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' }, valueAddedTaxIncluded: false },
      description: 'Per pharmacy premises, per month, plus VAT. First month free, no card needed.',
    },
    isAccessibleForFree: false,
    publisher: { '@id': `${SITE}/#organization` },
  };
  const page = {
    '@type': 'WebPage',
    '@id': `${SITE}/#webpage`,
    url: SITE,
    name: 'PharmacyCDReg.ie: digital Controlled Drugs Register for Irish pharmacies',
    inLanguage: 'en-IE',
    isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#website`, url: SITE, name: 'PharmacyCDReg.ie', publisher: { '@id': `${SITE}/#organization` } },
    about: { '@id': `${SITE}/#software` },
    audience: { '@type': 'MedicalAudience', audienceType: 'Pharmacists' },
    publisher: { '@id': `${SITE}/#organization` },
  };
  return { '@context': 'https://schema.org', '@graph': [org, app, page] };
}

/** For /privacy, /terms, /security. */
export function infoPageJsonLd(path: string, name: string, lastReviewed?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: `${SITE}${path}`,
    name,
    inLanguage: 'en-IE',
    ...(lastReviewed ? { lastReviewed } : {}),
    isPartOf: { '@type': 'WebSite', url: SITE, name: 'PharmacyCDReg.ie' },
    publisher: { '@type': 'Organization', name: 'PharmacyCDReg.ie', url: SITE },
  };
}

/** Safe to drop into a <script type="application/ld+json">: "<" can't close the tag. */
export const jsonLd = (o: object) => JSON.stringify(o).replace(/</g, '\\u003c');
