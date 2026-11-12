import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Duplicate guard, run on EVERY new register entry (scanned, typed or from Halo), per register:
 *
 *  Receipts
 *   - same invoice/docket number already received into this register      → BLOCK
 *     (an invoice and its CD docket / MDA receipt list the same goods)
 *   - same quantity received within 4 days (different/no number)          → WARN
 *  Supplies
 *   - same patient + same prescription/order reference                    → BLOCK
 *   - same patient + same quantity on the same day                        → BLOCK
 *   - same patient + same quantity within 3 days, same prescriber         → WARN
 *
 * BLOCK and WARN can both be overridden by the pharmacist with a reason (it's their call —
 * e.g. a genuine second supply), and the override is recorded in the audit trail.
 */
export type DupLevel = 'block' | 'warn';
export interface Duplicate { level: DupLevel; message: string; seq: number }

const DAY = 864e5;
const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * DAY).toISOString().slice(0, 10);

/** Reference tokens worth comparing: "Invoice E402886" → ["E402886"]; ignores short words/dates. */
export function refTokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 5 && /\d/.test(t) && !/^\d{1,2}$/.test(t));
}

const sameName = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

export async function findDuplicate(db: SupabaseClient, registerId: string, e: Record<string, any>): Promise<Duplicate | null> {
  const type = e.entry_type;
  if (type !== 'receipt' && type !== 'supply') return null;
  const date: string = e.transaction_date;
  const qty = Number(e.quantity);

  if (type === 'receipt') {
    const tokens = refTokens(e.notes);
    const { data } = await db.from('cd_ledger').select('seq, quantity, notes, supplier_name, transaction_date').eq('register_id', registerId).eq('entry_type', 'receipt').gte('transaction_date', addDays(date, -120)).limit(500);
    for (const r of data ?? []) {
      const theirs = refTokens(r.notes);
      const hit = tokens.find((t) => theirs.includes(t));
      if (hit) return { level: 'block', seq: r.seq, message: `Invoice/docket ${hit} is already recorded in this register (line ${r.seq}, ${Number(r.quantity)} received ${r.transaction_date}). An invoice and its CD docket list the same delivery — don’t add it twice.` };
    }
    for (const r of data ?? []) {
      if (r.supplier_name === 'Balance brought forward') continue;
      if (Number(r.quantity) === qty && Math.abs(new Date(r.transaction_date).getTime() - new Date(date).getTime()) <= 4 * DAY) {
        return { level: 'warn', seq: r.seq, message: `${qty} were already received on ${r.transaction_date} (line ${r.seq}${r.notes ? `, ${r.notes}` : ''}${r.supplier_name ? `, ${r.supplier_name}` : ''}). Is this the same delivery?` };
      }
    }
    return null;
  }

  // Supply
  const name: string | undefined = e.recipient_name;
  if (!name) return null;
  const { data } = await db.from('cd_ledger').select('id, seq, quantity, recipient_name, prescriber_name, prescription_ref, authority_to_possess, transaction_date').eq('register_id', registerId).eq('entry_type', 'supply').gte('transaction_date', addDays(date, -60)).lte('transaction_date', addDays(date, 60)).limit(1000);
  const mine = (data ?? []).filter((r) => sameName(r.recipient_name, name));
  const tokens = [...refTokens(e.prescription_ref), ...refTokens(e.authority_to_possess)];
  for (const r of mine) {
    const theirs = [...refTokens(r.prescription_ref), ...refTokens(r.authority_to_possess)];
    const hit = tokens.find((t) => theirs.includes(t));
    if (hit) return { level: 'block', seq: r.seq, message: `This prescription (${hit}) was already supplied to ${name} — line ${r.seq}, ${Number(r.quantity)} on ${r.transaction_date}.` };
  }
  for (const r of mine) {
    if (Number(r.quantity) === qty && r.transaction_date === date) return { level: 'block', seq: r.seq, message: `${qty} were already supplied to ${name} today (line ${r.seq}). Is this the same prescription?` };
  }
  for (const r of mine) {
    const days = Math.abs(new Date(r.transaction_date).getTime() - new Date(date).getTime()) / DAY;
    if (Number(r.quantity) === qty && days <= 3 && (!e.prescriber_name || !r.prescriber_name || sameName(e.prescriber_name, r.prescriber_name))) {
      return { level: 'warn', seq: r.seq, message: `${qty} were supplied to ${name} on ${r.transaction_date} (line ${r.seq}${r.prescriber_name ? `, Rx ${r.prescriber_name}` : ''}). Make sure this isn’t the same prescription.` };
    }
  }
  return null;
}
