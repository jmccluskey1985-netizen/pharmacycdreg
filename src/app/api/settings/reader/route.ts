import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { seal } from '@/lib/secret-box';
import { isSiteAdmin } from '@/lib/admin';
import { HttpError } from '@/lib/access';
import { parseServiceAccount, vertexAccessToken, VERTEX_LOCATIONS } from '@/lib/vertex';

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
    const { data, error } = await db.from('site_secrets').select('*').eq('id', 'reader').maybeSingle();
    return NextResponse.json({
      needs_migration: !!error,
      needs_vertex_migration: !error && !!data && !('reader_provider' in data),
      provider: data?.reader_provider ?? 'openrouter',
      vertex: { has_key: !!data?.vertex_sa_enc, client_email: data?.vertex_client_email ?? null, project: data?.vertex_project ?? null, location: data?.vertex_location ?? 'eu' },
      locations: VERTEX_LOCATIONS,
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
  provider: z.enum(['openrouter', 'vertex']).optional(),
  service_account_json: z.string().trim().max(10000).optional(),
  location: z.string().trim().max(40).optional(),
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
    // Google Vertex AI (EU): check the key by signing in to Google before saving it.
    if (parsed.data.provider === 'vertex') {
      const location = parsed.data.location || 'eu';
      if (!VERTEX_LOCATIONS.some((l) => l.id === location)) return NextResponse.json({ error: 'Choose an EU location' }, { status: 400 });
      const vrow: Record<string, unknown> = { id: 'reader', reader_provider: 'vertex', vertex_location: location, updated_at: new Date().toISOString() };
      if (parsed.data.service_account_json) {
        let creds;
        try { creds = parseServiceAccount(parsed.data.service_account_json); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
        try { await vertexAccessToken(creds); } catch (e) { return NextResponse.json({ error: `Google didn’t accept that key: ${(e as Error).message.slice(0, 160)}` }, { status: 400 }); }
        Object.assign(vrow, { vertex_sa_enc: seal(parsed.data.service_account_json), vertex_client_email: creds.client_email, vertex_project: creds.project_id });
      } else {
        const { data: existing } = await db.from('site_secrets').select('vertex_sa_enc').eq('id', 'reader').maybeSingle();
        if (!existing?.vertex_sa_enc) return NextResponse.json({ error: 'Paste the service-account key file (JSON)' }, { status: 400 });
      }
      const { error } = await db.from('site_secrets').upsert(vrow, { onConflict: 'id' });
      if (error) return NextResponse.json({ error: /column|relation|does not exist/i.test(error.message) ? 'Needs a one-off database update first (run migration 0014 in Supabase).' : 'Could not save' }, { status: 409 });
      await audit(account.pharmacyId, 'settings.reader_updated', staff, account.authUserId, { provider: 'vertex', location, key_changed: !!parsed.data.service_account_json });
      return NextResponse.json({ ok: true });
    }
    const row: Record<string, unknown> = { id: 'reader', openrouter_models: parsed.data.models.join(','), updated_at: new Date().toISOString() };
    if (parsed.data.provider === 'openrouter') row.reader_provider = 'openrouter';
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

export async function DELETE(req: Request) {
  try {
    const { account, staff } = await owner();
    const db = createServiceClient();
    if (new URL(req.url).searchParams.get('provider') === 'vertex') {
      await db.from('site_secrets').update({ vertex_sa_enc: null, vertex_client_email: null, vertex_project: null, reader_provider: 'openrouter', updated_at: new Date().toISOString() }).eq('id', 'reader');
      await audit(account.pharmacyId, 'settings.reader_key_removed', staff, account.authUserId, { provider: 'vertex' });
      return NextResponse.json({ ok: true });
    }
    await db.from('site_secrets').update({ openrouter_key_enc: null, openrouter_key_hint: null, updated_at: new Date().toISOString() }).eq('id', 'reader');
    await audit(account.pharmacyId, 'settings.reader_key_removed', staff, account.authUserId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
