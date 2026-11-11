import { createServiceClient } from '@/lib/supabase/server';
import { genericKey, sameStrength } from '@/lib/cd-catalogue';

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

export type MatchState = 'your_register' | 'pick_register' | 'no_register' ;

/**
 * Halo-style resolve(): your own registers first (YOUR LIST). Name compared as a
 * generic (brand → generic, salts dropped), strength compared numerically with units
 * normalised. A unique match wins; several → the pharmacist picks; none → open a
 * register (never a silent guess).
 */
export function matchRegister(regs: RegisterOption[], drugName: string, strength: string, form?: string, brand?: string | null) {
  const keys = [genericKey(drugName), brand ? genericKey(brand) : null].filter(Boolean) as string[];
  const sameDrug = regs.filter((r) => {
    const rk = genericKey(r.drug_name), ck = genericKey(r.class_name);
    return keys.some((k) => k.length > 2 && (k === rk || k === ck || rk.startsWith(k) || k.startsWith(rk)));
  });
  let exact = sameDrug.filter((r) => sameStrength(r.strength, strength));
  if (exact.length > 1 && form) {
    const f = form.toLowerCase();
    const byForm = exact.filter((r) => f.includes(r.form.toLowerCase().split(' ').pop()!) || r.form.toLowerCase().includes(f.split(' ').pop()!));
    if (byForm.length) exact = byForm;
  }
  const match = exact.length === 1 ? exact[0] : null;
  const state: MatchState = match ? 'your_register' : exact.length > 1 || sameDrug.length ? 'pick_register' : 'no_register';
  return { match, state, candidates: exact.length ? exact : sameDrug };
}
