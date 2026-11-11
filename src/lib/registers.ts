import { createServiceClient } from '@/lib/supabase/server';

export async function getRegisterForPharmacy(registerId: string, pharmacyId: string) {
  const db = createServiceClient();
  const { data } = await db
    .from('cd_registers')
    .select('id, pharmacy_id, opened_at, closed_at, product:cd_products(*)')
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
