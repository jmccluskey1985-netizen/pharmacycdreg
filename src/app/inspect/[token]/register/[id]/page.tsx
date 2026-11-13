import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { productTitle, genericLine } from '@/lib/product-name';
import { openLink, Frame, fmtDate, fmtQty } from '../../shared';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Register: inspection view', robots: { index: false, follow: false } };

const party = (r: any) =>
  r.entry_type === 'receipt' ? [r.supplier_name, r.supplier_address]
  : r.entry_type === 'destruction' ? ['DESTROYED', `Witness: ${r.witness_name} (${r.witness_role})${r.destruction_method ? ` · ${r.destruction_method}` : ''}`]
  : r.entry_type?.startsWith('adjustment') ? ['STOCK ADJUSTMENT', 'After stock check']
  : r.entry_type === 'patient_return' ? [`Patient return: ${r.recipient_name}`, 'Not pharmacy stock']
  : [r.recipient_name, r.recipient_address];

export default async function InspectRegister({ params }: { params: { token: string; id: string } }) {
  const { link, pharmacy, db } = await openLink(params.token, `register:${params.id}`);
  const { data: reg } = await db.from('cd_registers').select('id, opened_at, closed_at, product:cd_products(*)').eq('id', params.id).eq('pharmacy_id', pharmacy.id).maybeSingle();
  if (!reg) notFound();
  const p: any = (reg as any).product;
  const [{ data: rows }, { data: people }, chain] = await Promise.all([
    db.from('cd_ledger').select('*').eq('register_id', reg.id).order('seq'),
    db.from('staff').select('id, full_name, psi_number').eq('pharmacy_id', pharmacy.id),
    db.rpc('verify_register_chain', { reg: reg.id }),
  ]);
  const who = new Map((people ?? []).map((s) => [s.id, `${s.full_name}${s.psi_number ? ` (PSI ${s.psi_number})` : ''}`]));
  const integrity: any = chain.error ? null : Array.isArray(chain.data) ? chain.data[0] : chain.data;
  const notes = (rows ?? []).filter((r: any) => r.correction_count > 0);
  return (
    <Frame token={params.token} pharmacy={pharmacy} expires={link.expires_at} title={`${p.class_name}: ${productTitle(p)}`}>
      <p className="text-sm text-muted-foreground">{genericLine(p)} · Schedule {p.schedule}{p.schedule_paragraph ? ` (para ${p.schedule_paragraph})` : ''} · counted in {p.unit} · opened {fmtDate(reg.opened_at)}{reg.closed_at ? ` · closed ${fmtDate(reg.closed_at)}` : ''}</p>
      {integrity && <p className={`rounded-lg px-3 py-2 text-sm ${integrity.ok ? 'bg-brand/10' : 'bg-destructive/10 text-destructive'}`}>{integrity.ok ? `Integrity verified: all ${integrity.checked} lines match their fingerprints (latest ${String(integrity.head ?? '').slice(0, 16)}).` : `Integrity check failed at line ${integrity.broken_seq}: ${integrity.reason}.`}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="register-table min-w-[900px]">
          <thead>
            <tr><th>Line</th><th>Date</th><th>Name and address of person from whom obtained or to whom supplied</th><th>Authority to possess / prescriber / reference</th><th>Obtained</th><th>Supplied</th><th>Balance</th><th>Pharmacist</th></tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r: any) => {
              const [name, addr] = party(r);
              const inQ = ['receipt', 'adjustment_in'].includes(r.entry_type) ? fmtQty(r.quantity) : '';
              const outQ = ['supply', 'destruction', 'adjustment_out', 'patient_return_destruction'].includes(r.entry_type) ? fmtQty(r.quantity) : '';
              return (
                <tr key={r.id}>
                  <td className="tabular-nums">{r.seq}{r.correction_count > 0 && <sup className="font-bold text-red-600">*</sup>}</td>
                  <td className="tabular-nums">{fmtDate(r.transaction_date)}</td>
                  <td><span className="font-medium">{name}</span>{addr && <span className="block text-xs opacity-75">{addr}</span>}</td>
                  <td className="text-xs">{[r.authority_to_possess, r.prescriber_name && !r.authority_to_possess ? `Rx: ${r.prescriber_name}` : null, r.prescription_ref, r.entry_type === 'receipt' || r.entry_type?.startsWith('adjustment') ? r.notes : null].filter(Boolean).join(' · ')}</td>
                  <td className="text-right font-semibold tabular-nums">{inQ}</td>
                  <td className="text-right font-semibold tabular-nums">{outQ}</td>
                  <td className="text-right font-semibold tabular-nums">{fmtQty(r.running_balance)}</td>
                  <td className="text-xs">{who.get(r.recorded_by_staff_id) ?? ''}<span className="block opacity-60">{new Date(r.recorded_at).toLocaleString('en-IE', { dateStyle: 'short', timeStyle: 'short' })}</span></td>
                </tr>
              );
            })}
            {!rows?.length && <tr><td colSpan={8} className="text-center text-muted-foreground">No entries</td></tr>}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && (
        <div className="card text-sm">
          <p className="font-semibold">Corrections</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{notes.map((r: any) => <li key={r.id}>Line {r.seq} corrected {new Date(r.corrected_at).toLocaleString('en-IE')} by {who.get(r.corrected_by_staff_id) ?? 'pharmacist'}: {r.correction_reason}. The original entry is kept in the audit trail.</li>)}</ul>
        </div>
      )}
    </Frame>
  );
}
