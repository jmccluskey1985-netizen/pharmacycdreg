import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { seal } from '@/lib/secret-box';
import { isSiteAdmin } from '@/lib/admin';
import { HttpError } from '@/lib/access';

export const dynamic = 'force-dynamic';
// Site owner only (ADMIN_EMAILS): one key for every pharmacy's scanning.
async function owner() {
  const ctx = await requireStaff();
  if (!isSiteAdmin(ctx.account.email)) throw new HttpError(404, 'Not found');
  return ctx;
}
const NEEDS_MIGRATION = 'Needs a one-off database update first (run migration 0009 in Supabase).';

// Status only: the key itself is never returned.
export async function GET() {
  try {
    const { account } = await owner();
    const db = createServiceClient();
    const { data, error } = await db.from('site_secrets').select('openrouter_key_hint, openrouter_models, updated_at').eq('id', 'reader').maybeSingle();
    return NextResponse.json({
      needs_migration: !!error,
      has_key: !!data?.openrouter_key_hint,
      hint: data?.openrouter_key_hint ?? null,
      models: (data?.openrouter_models || '').split(',').map((m: string) => m.trim()).filter(Boolean),
      updated_at: data?.updated_at ?? null,
      environment_fallback: !!process.env.OPENROUTER_API_KEY,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  api_key: z.string().trim().min(20).max(300).optional(),
  models: z.array(z.string().trim().min(3).max(120).regex(/^[\w.\-:/]+$/)).max(4).default([]),
});

/** Check a key with OpenRouter (no document is sent). */
async function checkKey(key: string): Promise<{ ok: boolean; label?: string; message?: string }> {
  for (const path of ['/api/v1/key', '/api/v1/auth/key']) {
    try {
      const r = await fetch(`https://openrouter.ai${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
      if (r.status === 401 || r.status === 403) return { ok: false, message: 'OpenRouter didn’t accept that key. Check you copied all of it.' };
      if (r.ok) { const d = await r.json().catch(() => ({})); return { ok: true, label: d?.data?.label }; }
    } catch { /* try the next path */ }
  }
  return { ok: false, message: 'Couldn’t reach OpenRouter to check the key. Try again in a moment.' };
}

export async function PUT(req: Request) {
  try {
    const { account, staff } = await owner();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Paste the full key and choose at least one model' }, { status: 400 });
    const db = createServiceClient();
    const row: Record<string, unknown> = { id: 'reader', openrouter_models: parsed.data.models.join(','), updated_at: new Date().toISOString() };
    if (parsed.data.api_key) {
      const check = await checkKey(parsed.data.api_key);
      if (!check.ok) return NextResponse.json({ error: check.message }, { status: 400 });
      row.openrouter_key_enc = seal(parsed.data.api_key);
      row.openrouter_key_hint = `…${parsed.data.api_key.slice(-4)}`;
    } else {
      const { data: existing } = await db.from('site_secrets').select('openrouter_key_enc').eq('id', 'reader').maybeSingle();
      if (!existing?.openrouter_key_enc) return NextResponse.json({ error: 'Paste your OpenRouter key' }, { status: 400 });
    }
    const { error } = await db.from('site_secrets').upsert(row, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: /relation|does not exist/i.test(error.message) ? NEEDS_MIGRATION : 'Could not save' }, { status: 409 });
    await audit(account.pharmacyId, 'settings.reader_updated', staff, account.authUserId, { key_changed: !!parsed.data.api_key, models: parsed.data.models });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const { account, staff } = await owner();
    const db = createServiceClient();
    await db.from('site_secrets').update({ openrouter_key_enc: null, openrouter_key_hint: null, updated_at: new Date().toISOString() }).eq('id', 'reader');
    await audit(account.pharmacyId, 'settings.reader_key_removed', staff, account.authUserId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
