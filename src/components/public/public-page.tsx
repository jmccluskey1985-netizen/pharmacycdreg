import Link from 'next/link';
import { Logo } from '@/components/logo';

export function PublicPage({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <main className="theme-light min-h-screen bg-gradient-to-b from-secondary/70 to-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/?home=1" aria-label="PharmacyCDReg.ie home"><Logo size="sm" /></Link>
          <nav className="flex gap-3 text-sm text-muted-foreground"><Link href="/security" className="hover:text-foreground">Security</Link><Link href="/privacy" className="hover:text-foreground">Privacy</Link><Link href="/terms" className="hover:text-foreground">Terms</Link></nav>
        </div>
      </header>
      <article className="prose-cd mx-auto max-w-3xl space-y-4 px-4 py-10">
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <p className="text-lg text-muted-foreground">{intro}</p>}
        {children}
      </article>
      <PublicFooter />
    </main>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
      <nav className="mb-2 flex justify-center gap-4"><Link href="/security">Security</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
      PharmacyCDReg.ie is an independent service. It is not affiliated with the PSI, the HSE or the IPU.
    </footer>
  );
}

export const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="pt-4 text-xl font-semibold">{children}</h2>;
export const P = ({ children }: { children: React.ReactNode }) => <p className="leading-relaxed">{children}</p>;
export const UL = ({ children }: { children: React.ReactNode }) => <ul className="list-disc space-y-1.5 pl-6 leading-relaxed">{children}</ul>;
