/** The public guides: one list for the index page, the sitemap, related links and schema. */
export interface GuideMeta { slug: string; title: string; short: string; description: string; minutes: number; tag: string; published: string; updated: string }

export const GUIDES: GuideMeta[] = [
  {
    slug: 'electronic-cd-register-ireland',
    title: 'Electronic CD registers in Ireland: a practical guide',
    short: 'Electronic CD registers in Ireland',
    description: 'What a Controlled Drugs Register entry records, how an electronic register keeps it safe, and what to check before you rely on one in an Irish community pharmacy.',
    minutes: 6, tag: 'Essentials', published: '2026-11-20', updated: '2026-11-20',
  },
  {
    slug: 'cd-stock-check-touchstore-mps',
    title: 'How to do a CD stock check against your Touchstore or MPS report',
    short: 'CD stock check with your Touchstore or MPS report',
    description: 'Count, compare and find the missing entries: a step-by-step CD stock check using the dispensing report from Touchstore (.QRP), MPS (CSV) or any other system.',
    minutes: 5, tag: 'How-to', published: '2026-11-20', updated: '2026-11-20',
  },
  {
    slug: 'paper-to-electronic-cd-register',
    title: 'Moving from a paper CD register to an electronic one',
    short: 'From paper to electronic CD register',
    description: 'A calm, step-by-step changeover: pick a date, check stock, carry each balance forward, close the paper books properly and get the team going.',
    minutes: 6, tag: 'How-to', published: '2026-11-20', updated: '2026-11-20',
  },
];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug)!;
