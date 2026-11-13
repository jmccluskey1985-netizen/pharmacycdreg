import Link from 'next/link';
import type { Metadata } from 'next';
import { productTitle } from '@/lib/product-name';
import { openLink, Frame, fmtQty } from './shared';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Inspection view — PharmacyCDReg.ie', robots: { index: false, follow: false } };

export default async function InspectHome({ params }: { params: { token: string } }) {
  const { link, pharmacy, db } = await openLink(params.token, 'registers');
  const { data: regs } = await db.from('cd_registers').select('id, opened_at, closed_at, product:cd_products(*)').eq('pharmacy_id', pharmacy.id).order('opened_at');
  const ids = (regs ?? []).map((r) => r.id);
  const { data: ledger } = ids.length ? await db.from('cd_ledger').select('register_id, seq, running_balance').in('register_id', ids).order('seq') : { data: [] as any[] };
  const bal: Record<string, { balance: number; lines: number }> = {};
  for (const l of ledger ?? []) bal[l.register_id] = { balance: Number(l.running_balance), lines: (bal[l.register_id]?.lines ?? 0) + 1 };
  const byClass = (regs ?? []).reduce<Record<string, any[]>>((a, r: any) => ((a[r.product.class_name] ||= []).push(r), a), {});
  return (
    <Frame token={params.token} pharmacy={pharmacy} expires={link.expires_at} title="Registers of Controlled Drugs">
      {Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b)).map(([cls, list]) => (
        <section key={cls} className="card p-0">
          <h2 className="border-b border-border px-4 py-2 font-semibold">{cls}</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th className="px-4 py-2">Product</th><th className="px-4 py-2">Schedule</th><th className="px-4 py-2 text-right">Lines</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>
              {list.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2"><Link href={`/inspect/${params.token}/register/${r.id}`} className="font-medium text-primary underline">{productTitle(r.product)}</Link></td>
                  <td className="px-4 py-2">{r.product.schedule}{r.product.schedule_paragraph ? ` (para ${r.product.schedule_paragraph})` : ''}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{bal[r.id]?.lines ?? 0}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmtQty(bal[r.id]?.balance ?? 0)} {r.product.unit}</td>
                  <td className="px-4 py-2 text-xs">{r.closed_at ? 'Closed' : 'Live'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {!regs?.length && <p className="text-sm text-muted-foreground">No registers.</p>}
    </Frame>
  );
}
