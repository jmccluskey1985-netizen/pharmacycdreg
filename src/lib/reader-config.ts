import type { SupabaseClient } from '@supabase/supabase-js';
import { open } from './secret-box';

export interface ReaderConfig { apiKey: string; models: string[]; source: 'settings' | 'environment' }

const parseModels = (s: string | null | undefined) => (s || '').split(',').map((m) => m.trim()).filter(Boolean);

/** The site-wide OpenRouter key/models (set by the site owner in Settings), else the environment ones. */
export async function getReaderConfig(db: SupabaseClient): Promise<ReaderConfig | null> {
  const { data, error } = await db.from('site_secrets').select('openrouter_key_enc, openrouter_models').eq('id', 'reader').maybeSingle();
  if (!error && data?.openrouter_key_enc) {
    const apiKey = open(data.openrouter_key_enc);
    const models = parseModels(data.openrouter_models);
    if (apiKey && models.length) return { apiKey, models, source: 'settings' };
  }
  const envModels = parseModels(process.env.OPENROUTER_MODELS);
  if (process.env.OPENROUTER_API_KEY && envModels.length) return { apiKey: process.env.OPENROUTER_API_KEY, models: envModels, source: 'environment' };
  return null;
}
