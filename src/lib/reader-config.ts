import type { SupabaseClient } from '@supabase/supabase-js';
import { open } from './secret-box';

export interface ReaderConfig { apiKey: string; models: string[]; source: 'settings' | 'environment' }

const parseModels = (s: string | null | undefined) => (s || '').split(',').map((m) => m.trim()).filter(Boolean);

/** The pharmacy's own OpenRouter key/models from Settings, else the site-wide environment ones. */
export async function getReaderConfig(db: SupabaseClient, pharmacyId: string): Promise<ReaderConfig | null> {
  const { data, error } = await db.from('pharmacy_secrets').select('openrouter_key_enc, openrouter_models').eq('pharmacy_id', pharmacyId).maybeSingle();
  if (!error && data?.openrouter_key_enc) {
    const apiKey = open(data.openrouter_key_enc);
    const models = parseModels(data.openrouter_models);
    if (apiKey && models.length) return { apiKey, models, source: 'settings' };
  }
  const envModels = parseModels(process.env.OPENROUTER_MODELS);
  if (process.env.OPENROUTER_API_KEY && envModels.length) return { apiKey: process.env.OPENROUTER_API_KEY, models: envModels, source: 'environment' };
  return null;
}
