import { createServiceClient } from '@/lib/supabase/server';

const norm = (s: string) => s.toLowerCase().replace(/hydrochloride|sulfate|sulphate|tartrate|citrate|base|\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const normStrength = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/micrograms?|µg|ug/g, 'mcg').replace(/milligrams?/g, 'mg');

export interface RegisterOption { id: string; label: string; drug_name: string; strength: string; form: string; unit: string; class_name: string }

export async function liveRegisters(pharmacyId: string): Promise<RegisterOption[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('cd_registers')
    .select('id, product:cd_products(drug_name, strength, form, unit, class_name)')
    .eq('pharmacy_id', pharmacyId)
    .is('closed_at', null);
  return (data ?? []).map((r: any) => ({ id: r.id, ...r.product, label: `${r.product.drug_name} ${r.product.strength} ${r.product.form}` }));
}

/** Match a drug name + strength to a live register. Unique exact-strength match wins. */
export function matchRegister(regs: RegisterOption[], drugName: string, strength: string, form?: string) {
  const it = norm(drugName);
  const candidates = it.length > 2 ? regs.filter((r) => {
    const dn = norm(r.drug_name), cn = norm(r.class_name);
    return dn.includes(it) || it.includes(dn) || it.includes(cn);
  }) : [];
  let exact = candidates.filter((r) => normStrength(r.strength) === normStrength(strength));
  if (exact.length > 1 && form) {
    const f = exact.filter((r) => norm(r.form) === norm(form) || norm(form).includes(norm(r.form)));
    if (f.length) exact = f;
  }
  return { match: exact.length === 1 ? exact[0] : null, candidates: exact.length ? exact : candidates };
}
