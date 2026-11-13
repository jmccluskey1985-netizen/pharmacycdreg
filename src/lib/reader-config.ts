import type { SupabaseClient } from '@supabase/supabase-js';
import { open } from './secret-box';

import type { VertexCredentials } from './vertex';

export type ReaderConfig =
  | { provider: 'openrouter'; apiKey: string; models: string[]; source: 'settings' | 'environment' }
  | { provider: 'vertex'; credentials: VertexCredentials; location: string; models: string[]; source: 'settings' };

// Vertex AI: Gemini 3.8 Flash first; if that name isn't served in the chosen location, a
// generally-available Gemini Flash takes over (the Test button in Settings shows which answered).
export const VERTEX_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash'];

const parseModels = (s: string | null | undefined) => (s || '').split(',').map((m) => m.trim()).filter(Boolean);

// Fixed to Halo's chain (docs/RX_READER_SPEC.md §1) — not changeable in the app.
export const PRIMARY_MODEL = 'google/gemini-3.8-flash';
export const HALO_BACKUPS = ['qwen/qwen3-vl-235b-a22b-instruct', 'qwen/qwen2.5-vl-72b-instruct'];
export const MODEL_CHAIN = [PRIMARY_MODEL, ...HALO_BACKUPS];
export const modelChain = (_saved?: string[]) => MODEL_CHAIN;

/** The site-wide OpenRouter key/models (set by the site owner in Settings), else the environment ones. */
export async function getReaderConfig(db: SupabaseClient): Promise<ReaderConfig | null> {
  const { data, error } = await db.from('site_secrets').select('*').eq('id', 'reader').maybeSingle();
  if (!error && data?.reader_provider === 'vertex' && data.vertex_sa_enc) {
    const raw = open(data.vertex_sa_enc);
    if (raw) {
      try {
        const { parseServiceAccount } = await import('./vertex');
        return { provider: 'vertex', credentials: parseServiceAccount(raw), location: data.vertex_location || 'eu', models: VERTEX_MODELS, source: 'settings' };
      } catch { /* fall through to OpenRouter / environment */ }
    }
  }
  if (!error && data?.openrouter_key_enc) {
    const apiKey = open(data.openrouter_key_enc);
    if (apiKey) return { provider: 'openrouter', apiKey, models: modelChain(parseModels(data.openrouter_models)), source: 'settings' };
  }
  const envModels = parseModels(process.env.OPENROUTER_MODELS);
  if (process.env.OPENROUTER_API_KEY) return { provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY, models: modelChain(envModels), source: 'environment' };
  return null;
}
