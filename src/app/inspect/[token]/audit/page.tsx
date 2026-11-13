import type { Metadata } from 'next';
import { openLink, Frame } from '../shared';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit trail — inspection view', robots: { index: false, follow: false } };

export default async function InspectAudit({ params }: { params: { token: string } }) {
  const { link, pharmacy, db } = await openLink(params.token, 'audit');
  const [{ data: events }, chain] = await Promise.all([
    db.from('audit_log').select('id, occurred_at, action, staff_name, target_table').eq('pharmacy_id', pharmacy.id).order('occurred_at', { ascending: false }).limit(1000),
    db.rpc('verify_audit_chain', { ph: pharmacy.id }),
  ]);
  const integrity: any = chain.error ? null : Array.isArray(chain.data) ? chain.data[0] : chain.data;
  return (
    <Frame token={params.token} pharmacy={pharmacy} expires={link.expires_at} title="Audit trail">
      {integrity && <p className={`rounded-lg px-3 py-2 text-sm ${integrity.ok ? 'bg-brand/10' : 'bg-destructive/10 text-destructive'}`}>{integrity.ok ? `Integrity verified: ${integrity.checked} audit records match their fingerprints.` : `Integrity check failed at record ${integrity.broken_seq}: ${integrity.reason}.`}</p>}
      <p className="text-sm text-muted-foreground">Most recent 1,000 events. The audit trail cannot be edited or deleted.</p>
      <div className="card overflow-x-auto p-0"><table className="register-table min-w-[640px]">
        <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
        <tbody>{(events ?? []).map((e) => <tr key={e.id}><td className="tabular-nums">{new Date(e.occurred_at).toLocaleString('en-IE')}</td><td>{e.staff_name ?? 'Pharmacy account'}</td><td className="text-xs">{e.action.replace(/[._]/g, ' ')}</td></tr>)}</tbody>
      </table></div>
    </Frame>
  );
}
