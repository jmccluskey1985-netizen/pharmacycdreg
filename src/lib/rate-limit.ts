import { createServiceClient } from '@/lib/supabase/server';

// Attempt limits. Counted in the database (migration 0018), so every Vercel server shares
// the same count; keys are stored hashed. Falls back to a per-server count if the database
// function isn't there yet or can't be reached, so a limit never blocks a legitimate user
// because of an outage, but also never disappears.
const store = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  entry.count += 1;
  return { ok: entry.count <= maxRequests, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}

export async function checkRateLimit(key: string, maxRequests: number, windowMs: number, add = 1): Promise<{ ok: boolean; retryAfter: number }> {
  const local = add ? memoryLimit(key, maxRequests, windowMs) : { ok: true, retryAfter: 0 };
  try {
    const { data, error } = await createServiceClient().rpc('rate_limit_hit', { k: key, max_hits: maxRequests, window_seconds: Math.ceil(windowMs / 1000), add });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return local;
    // Refuse if either count says so (the shared one is the real limit)
    return { ok: row.ok && local.ok, retryAfter: Math.max(row.retry_after ?? 0, local.ok ? 0 : local.retryAfter) };
  } catch {
    return local;
  }
}

export function clientKey(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}
