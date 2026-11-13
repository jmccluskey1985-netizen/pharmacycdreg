import type { SupabaseClient } from '@supabase/supabase-js';

export const NEEDS_0011 = 'Quarantine and the destruction book need a one-off database update (run migration 0011 in Supabase).';
export const missingTable = (msg?: string) => !!msg && /relation|does not exist|schema cache|Could not find the table/i.test(msg);

/** Amount awaiting destruction per register (still part of each balance). */
export async function quarantinedFor(db: SupabaseClient, pharmacyId: string, registerIds?: string[]): Promise<Record<string, number>> {
  let q = db.from('quarantine_items').select('register_id, quantity').eq('pharmacy_id', pharmacyId).eq('status', 'awaiting');
  if (registerIds?.length) q = q.in('register_id', registerIds);
  const { data, error } = await q;
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.register_id] = (out[r.register_id] ?? 0) + Number(r.quantity);
  return out;
}
