import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Per-pharmacy switches. Read with select('*') so the app keeps working before the
 * column's migration has been run (the feature is simply off until then).
 */
export async function haloEnabled(db: SupabaseClient, pharmacyId: string): Promise<boolean> {
  const { data } = await db.from('pharmacies').select('*').eq('id', pharmacyId).maybeSingle();
  return (data as any)?.halo_enabled === true;
}
