import type { SupabaseClient } from '@supabase/supabase-js';

export type StockCheckFrequency = 'off' | 'weekly' | 'fortnightly' | 'monthly';
export interface PharmacySettings {
  name: string;
  address: string;
  psi_premises_number: string | null;
  invoice_names: string | null;
  lock_minutes: number;
  locum_default_days: number;
  stock_check_frequency: StockCheckFrequency;
  halo_enabled: boolean;
  migrated: boolean; // false until migration 0007 has been run
}

export const FREQ_DAYS: Record<StockCheckFrequency, number | null> = { off: null, weekly: 7, fortnightly: 14, monthly: 31 };

/** Read with defaults, so the app works before the settings migration is run. */
export async function getSettings(db: SupabaseClient, pharmacyId: string): Promise<PharmacySettings> {
  const { data } = await db.from('pharmacies').select('*').eq('id', pharmacyId).maybeSingle();
  const p = (data ?? {}) as any;
  return {
    name: p.name ?? '',
    address: p.address ?? '',
    psi_premises_number: p.psi_premises_number ?? null,
    invoice_names: p.invoice_names ?? null,
    lock_minutes: typeof p.lock_minutes === 'number' ? p.lock_minutes : 15,
    locum_default_days: typeof p.locum_default_days === 'number' ? p.locum_default_days : 14,
    stock_check_frequency: p.stock_check_frequency ?? 'monthly',
    halo_enabled: p.halo_enabled === true,
    migrated: 'lock_minutes' in p,
  };
}
