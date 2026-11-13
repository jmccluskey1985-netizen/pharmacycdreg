import { createServiceClient } from '@/lib/supabase/server';

export async function getRegisterForPharmacy(registerId: string, pharmacyId: string) {
  const db = createServiceClient();
  const { data } = await db
    .from('cd_registers')
    .select('id, pharmacy_id, opened_at, closed_at, product:cd_products(*, parent:is_stereoisomer_of(drug_name))')
    .eq('id', registerId)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();
  return data as any;
}

export async function currentBalance(registerId: string): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from('cd_ledger')
    .select('running_balance')
    .eq('register_id', registerId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.running_balance ?? 0);
}

export async function balancesFor(registerIds: string[]): Promise<Record<string, number>> {
  if (!registerIds.length) return {};
  const db = createServiceClient();
  const { data } = await db
    .from('cd_ledger')
    .select('register_id, seq, running_balance')
    .in('register_id', registerIds)
    .order('seq', { ascending: true });
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.register_id] = Number(r.running_balance);
  return out;
}

/** Balance and number of lines per register (one read of the ledger). */
export async function ledgerSummary(registerIds: string[]): Promise<Record<string, { balance: number; entries: number }>> {
  if (!registerIds.length) return {};
  const db = createServiceClient();
  const { data } = await db.from('cd_ledger').select('register_id, seq, running_balance').in('register_id', registerIds).order('seq', { ascending: true });
  const out: Record<string, { balance: number; entries: number }> = {};
  for (const r of data ?? []) {
    const o = (out[r.register_id] ||= { balance: 0, entries: 0 });
    o.balance = Number(r.running_balance);
    o.entries++;
  }
  return out;
}
