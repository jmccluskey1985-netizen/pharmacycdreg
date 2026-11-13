import type { Metadata } from 'next';
import { productTitle } from '@/lib/product-name';
import { openLink, Frame, fmtDate, fmtQty } from '../shared';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Destructions — inspection view', robots: { index: false, follow: false } };

export default async function InspectDestructions({ params }: { params: { token: string } }) {
  const { link, pharmacy, db } = await openLink(params.token, 'destructions');
  const { data: regs } = await db.from('cd_registers').select('id, product:cd_products(*)').eq('pharmacy_id', pharmacy.id);
  const label = new Map((regs ?? []).map((r: any) => [r.id, productTitle(r.product)]));
  const unit = new Map((regs ?? []).map((r: any) => [r.id, r.product.unit]));
  const ids = Array.from(label.keys());
  const [{ data: witnessed }, { data: waiting }, { data: book }] = await Promise.all([
    ids.length ? db.from('cd_ledger').select('*').in('register_id', ids).eq('entry_type', 'destruction').order('transaction_date', { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    db.from('quarantine_items').select('*').eq('pharmacy_id', pharmacy.id).eq('status', 'awaiting'),
    db.from('destruction_book').select('*').eq('pharmacy_id', pharmacy.id).order('received_date', { ascending: false }),
  ]);
  return (
    <Frame token={params.token} pharmacy={pharmacy} expires={link.expires_at} title="Destructions">
      <section className="space-y-2">
        <h2 className="font-semibold">Witnessed Destruction Record (Schedule 2 stock)</h2>
        <div className="card overflow-x-auto p-0"><table className="register-table min-w-[760px]">
          <thead><tr><th>Date</th><th>Product</th><th>Amount</th><th>Authorised witness</th><th>Capacity</th><th>Method</th><th>Details</th></tr></thead>
          <tbody>
            {(witnessed ?? []).map((r: any) => <tr key={r.id}><td>{fmtDate(r.transaction_date)}</td><td>{label.get(r.register_id)}</td><td className="text-right font-semibold">{fmtQty(r.quantity)} {unit.get(r.register_id)}</td><td>{r.witness_name}</td><td>{r.witness_role}</td><td>{r.destruction_method}</td><td className="text-xs">{r.notes}</td></tr>)}
            {!witnessed?.length && <tr><td colSpan={7} className="text-center text-muted-foreground">None recorded</td></tr>}
          </tbody>
        </table></div>
        {!!waiting?.length && <p className="text-sm">Set aside awaiting destruction (still in the register balance): {waiting.map((q: any) => `${label.get(q.register_id)} — ${fmtQty(q.quantity)} ${unit.get(q.register_id)} (${q.reason}${q.batch ? `, batch ${q.batch}` : ''}${q.expiry_date ? `, exp ${fmtDate(q.expiry_date)}` : ''})`).join('; ')}</p>}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">CD Destruction Record Book (patient returns and Schedule 3/4 stock)</h2>
        <div className="card overflow-x-auto p-0"><table className="register-table min-w-[900px]">
          <thead><tr><th>Received</th><th>Type</th><th>Drug</th><th>Amount</th><th>Returned by</th><th>Received by</th><th>Destroyed</th><th>Destroyed by</th><th>Witness</th></tr></thead>
          <tbody>
            {(book ?? []).map((r: any) => <tr key={r.id}><td>{fmtDate(r.received_date)}</td><td className="text-xs">{r.kind === 'patient_return' ? 'Patient return' : `Expired stock (Sch ${r.schedule ?? '?'})`}</td><td>{r.drug}</td><td className="text-right font-semibold">{fmtQty(r.quantity)} {r.unit}</td><td>{r.returned_by_name ?? '—'}</td><td className="text-xs">{r.received_by_name}</td><td>{r.destroyed_date ? fmtDate(r.destroyed_date) : 'awaiting'}</td><td className="text-xs">{r.destroyed_by_name ?? ''}</td><td className="text-xs">{r.witness_name ?? ''}{r.witness_role ? ` (${r.witness_role})` : ''}</td></tr>)}
            {!book?.length && <tr><td colSpan={9} className="text-center text-muted-foreground">Nothing recorded</td></tr>}
          </tbody>
        </table></div>
      </section>
    </Frame>
  );
}
