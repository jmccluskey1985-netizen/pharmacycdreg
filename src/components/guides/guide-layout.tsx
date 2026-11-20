import Link from 'next/link';
import { ArrowRight, BookOpen, Clock, ChevronRight } from 'lucide-react';
import { Logo } from '@/components/logo';
import { PublicFooter } from '@/components/public/public-page';
import { GUIDES, type GuideMeta } from '@/lib/guides';
import { guideJsonLd, jsonLd } from '@/lib/structured-data';

const date = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

export function GuideHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/?home=1" aria-label="PharmacyCDReg.ie home"><Logo size="sm" /></Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/guides" className="font-semibold text-foreground">Guides</Link>
          <Link href="/data-safety" className="hidden hover:text-foreground sm:inline">Data safety</Link>
          <Link href="/?home=1#pricing" className="btn-primary px-3 py-1.5 text-sm">Try it free</Link>
        </nav>
      </div>
    </header>
  );
}

/**
 * A guide: hero with breadcrumb, reading time and review date; an "On this page" list that
 * stays in view on wide screens; the body; then a call to action and the other guides.
 */
export function GuideLayout({ meta, toc, children, steps }: { meta: GuideMeta; toc: { id: string; label: string }[]; children: React.ReactNode; steps?: { name: string; text: string }[] }) {
  const others = GUIDES.filter((g) => g.slug !== meta.slug);
  return (
    <main className="theme-light min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(guideJsonLd(meta, steps)) }} />
      <GuideHeader />
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-secondary/80 to-background">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-brand-dark/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/?home=1" className="hover:text-foreground">Home</Link><ChevronRight className="h-3 w-3" />
            <Link href="/guides" className="hover:text-foreground">Guides</Link><ChevronRight className="h-3 w-3" />
            <span className="truncate text-foreground">{meta.short}</span>
          </nav>
          <p className="mt-5 inline-flex rounded-full bg-brand/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-dark">{meta.tag}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{meta.title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{meta.description}</p>
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {meta.minutes} minute read</span>
            <span>Reviewed {date(meta.updated)}</span>
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <article className="min-w-0 space-y-6 text-[17px] leading-relaxed [&_h2]:scroll-mt-24">{children}</article>
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-border">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">On this page</p>
              <ol className="mt-2 space-y-1.5 text-sm">{toc.map((t, i) => <li key={t.id}><a href={`#${t.id}`} className="flex gap-2 text-muted-foreground hover:text-foreground"><span className="font-semibold text-brand">{i + 1}</span>{t.label}</a></li>)}</ol>
            </div>
            <div className="rounded-2xl bg-brand-dark p-4 text-white shadow-soft">
              <p className="font-bold">Try it with your own books</p>
              <p className="mt-1 text-sm text-white/80">First month free. No card needed.</p>
              <Link href="/?home=1#pricing" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-dark">Get started <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </aside>
      </div>

      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <p className="text-xs text-muted-foreground">General guidance for Irish community pharmacies, not legal advice. Always follow the Misuse of Drugs Regulations and current PSI guidance; if in doubt, ask the PSI or your professional body.</p>
          <h2 className="mt-6 text-xl font-bold">More guides</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">{others.map((g) => <GuideCard key={g.slug} g={g} />)}</div>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}

export function GuideCard({ g }: { g: GuideMeta }) {
  return (
    <Link href={`/guides/${g.slug}`} className="group flex flex-col rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-brand/40">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-dark"><BookOpen className="h-3 w-3" /> {g.tag}</span>
      <span className="mt-3 text-lg font-bold leading-snug group-hover:text-brand-dark">{g.title}</span>
      <span className="mt-1 text-sm text-muted-foreground">{g.description}</span>
      <span className="mt-auto pt-3 text-sm font-semibold text-brand-dark">Read the guide ({g.minutes} min) <ArrowRight className="inline h-4 w-4 transition group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

/** Section heading with an anchor for "On this page". */
export const GH2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="pt-6 text-2xl font-bold tracking-tight">{children}</h2>;
export const Callout = ({ tone = 'brand', title, children }: { tone?: 'brand' | 'amber'; title: string; children: React.ReactNode }) => (
  <div className={`rounded-2xl p-5 ring-1 ${tone === 'amber' ? 'bg-amber-50 ring-amber-200 text-amber-950' : 'bg-secondary ring-brand/20'}`}>
    <p className="font-bold">{title}</p>
    <div className="mt-1 text-[15px] leading-relaxed">{children}</div>
  </div>
);
