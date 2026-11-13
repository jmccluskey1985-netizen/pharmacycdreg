import { createHash, randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';

export const newToken = () => randomBytes(24).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** The pharmacy an inspector link opens, or null if it's unknown, revoked or expired. */
export async function resolveInspectorLink(token: string, opts: { touch?: boolean } = {}) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = createServiceClient();
  const { data } = await db.from('inspector_links').select('id, pharmacy_id, label, expires_at, revoked_at, use_count').eq('token_hash', hashToken(token)).maybeSingle();
  if (!data || data.revoked_at || new Date(data.expires_at) < new Date()) return null;
  if (opts.touch) await db.from('inspector_links').update({ last_used_at: new Date().toISOString(), use_count: (data.use_count ?? 0) + 1 }).eq('id', data.id);
  const { data: ph } = await db.from('pharmacies').select('id, name, address, psi_premises_number').eq('id', data.pharmacy_id).single();
  return { link: data, pharmacy: ph!, db };
}
