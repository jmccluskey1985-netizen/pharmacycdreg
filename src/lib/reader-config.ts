import type { SupabaseClient } from '@supabase/supabase-js';
import { open } from './secret-box';

export interface ReaderConfig { apiKey: string; models: string[]; source: 'settings' | 'environment' }

const parseModels = (s: string | null | undefined) => (s || '').split(',').map((m) => m.trim()).filter(Boolean);

// Fixed to Halo's chain (docs/RX_READER_SPEC.md §1) — not changeable in the app.
export const PRIMARY_MODEL = 'google/gemini-3.8-flash';
export const HALO_BACKUPS = ['qwen/qwen3-vl-235b-a22b-instruct', 'qwen/qwen2.5-vl-72b-instruct'];
export const MODEL_CHAIN = [PRIMARY_MODEL, ...HALO_BACKUPS];
export const modelChain = (_saved?: string[]) => MODEL_CHAIN;

/** The site-wide OpenRouter key/models (set by the site owner in Settings), else the environment ones. */
export async function getReaderConfig(db: SupabaseClient): Promise<ReaderConfig | null> {
  const { data, error } = await db.from('site_secrets').select('openrouter_key_enc, openrouter_models').eq('id', 'reader').maybeSingle();
  if (!error && data?.openrouter_key_enc) {
    const apiKey = open(data.openrouter_key_enc);
    if (apiKey) return { apiKey, models: modelChain(parseModels(data.openrouter_models)), source: 'settings' };
  }
  const envModels = parseModels(process.env.OPENROUTER_MODELS);
  if (process.env.OPENROUTER_API_KEY) return { apiKey: process.env.OPENROUTER_API_KEY, models: modelChain(envModels), source: 'environment' };
  return null;
}
