import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveInspectorLink } from '@/lib/inspector';
import { PrintButton } from './print-button';

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export const fmtQty = (q: unknown) => Number(q).toLocaleString('en-IE', { maximumFractionDigits: 3 });

/** Resolve the link (404 if unknown / expired / revoked) and log the view in the pharmacy's audit trail. */
export async function openLink(token: string, page: string) {
  const r = await resolveInspectorLink(token, { touch: true });
  if (!r) notFound();
  await r.db.from('audit_log').insert({ pharmacy_id: r.pharmacy.id, action: 'inspector.viewed', staff_name: `Inspector link: ${r.link.label}`, target_table: 'inspector_links', target_id: r.link.id, details: { page } });
  return r;
}

export function Frame({ token, pharmacy, expires, children, title }: { token: string; pharmacy: { name: string; address: string; psi_premises_number: string | null }; expires: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="no-print rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
        Read-only inspection view · nothing can be changed here · link valid until {new Date(expires).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })}
      </div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{pharmacy.name} · {pharmacy.address}{pharmacy.psi_premises_number ? ` · PSI premises ${pharmacy.psi_premises_number}` : ''}</p>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <nav className="no-print flex flex-wrap gap-2 text-sm">
          <Link href={`/inspect/${token}`} className="btn-ghost">All registers</Link>
          <Link href={`/inspect/${token}/destructions`} className="btn-ghost">Destructions</Link>
          <Link href={`/inspect/${token}/audit`} className="btn-ghost">Audit trail</Link>
          <PrintButton />
        </nav>
      </header>
      {children}
    </div>
  );
}
