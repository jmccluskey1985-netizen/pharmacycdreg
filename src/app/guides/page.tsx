import type { Metadata } from 'next';
import { GuideHeader, GuideCard } from '@/components/guides/guide-layout';
import { PublicFooter } from '@/components/public/public-page';
import { GUIDES } from '@/lib/guides';
import { FileImportDemo } from '@/components/landing-demos';
import { jsonLd } from '@/lib/structured-data';

export const metadata: Metadata = {
  title: 'Guides for CD registers and stock checks | PharmacyCDReg.ie',
  description: 'Practical, animated guides for Irish community pharmacies: electronic Controlled Drugs Registers, CD stock checks with your Touchstore or MPS report, and moving from paper to electronic.',
  alternates: { canonical: '/guides' },
};

const SITE = 'https://pharmacycdreg.ie';

export default function GuidesIndex() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: `${SITE}/guides`,
    name: 'Guides for CD registers and stock checks',
    inLanguage: 'en-IE',
    hasPart: GUIDES.map((g) => ({ '@type': 'Article', headline: g.title, url: `${SITE}/guides/${g.slug}`, datePublished: g.published })),
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'PharmacyCDReg.ie', item: SITE }, { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE}/guides` }] },
  };
  return (
    <main className="theme-light min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <GuideHeader />
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-secondary/80 to-background">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-12">
          <p className="inline-flex rounded-full bg-brand/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-dark">Guides</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">Controlled drugs, made clear</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Short, practical guides for Irish community pharmacies, with animations that show each step. Written for pharmacists, technicians and pharmacy owners.</p>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-5 md:grid-cols-3">{GUIDES.map((g) => <GuideCard key={g.slug} g={g} />)}</div>
        <div className="mt-12"><FileImportDemo /></div>
      </div>
      <PublicFooter />
    </main>
  );
}
