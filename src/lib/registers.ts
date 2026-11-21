import { createServiceClient } from '@/lib/supabase/server';
import { productTitle, genericLine } from '@/lib/product-name';
import type { RegisterOption } from '@/lib/match';

export async function liveRegisters(pharmacyId: string): Promise<RegisterOption[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('cd_registers')
    .select('id, product:cd_products(*)')
    .eq('pharmacy_id', pharmacyId)
    .is('closed_at', null);
  // Register id must win over the product's own id; label leads with the brand.
  return (data ?? []).map((r: any) => ({ ...r.product, id: r.id, label: `${productTitle(r.product)}${genericLine(r.product) ? ` (${genericLine(r.product)})` : ''}` }));
}

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
