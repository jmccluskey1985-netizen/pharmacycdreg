import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit, HttpError } from '@/lib/access';
import { haloEnabled } from '@/lib/features';
import { createServiceClient } from '@/lib/supabase/server';
import { newIntegrationKey, hashKey } from '@/lib/integration-keys';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { account } = await requireStaff(can.manageStaff);
    if (!(await haloEnabled(createServiceClient(), account.pharmacyId))) throw new HttpError(404, 'Not available');
    const db = createServiceClient();
    const { data } = await db.from('integration_keys').select('id, name, key_prefix, auto_post, created_at, last_used_at, revoked_at').eq('pharmacy_id', account.pharmacyId).order('created_at', { ascending: false });
    return NextResponse.json({ keys: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

const Create = z.object({ name: z.string().trim().min(2).max(80) });
const Update = z.object({ id: z.string().uuid(), auto_post: z.boolean().optional(), revoke: z.boolean().optional() });

// Create a key (shown ONCE) or update auto-post / revoke.
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.manageStaff);
    if (!(await haloEnabled(createServiceClient(), account.pharmacyId))) throw new HttpError(404, 'Not available');
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();

    if (body.id) {
      const u = Update.safeParse(body);
      if (!u.success) return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if (u.data.auto_post !== undefined) patch.auto_post = u.data.auto_post;
      if (u.data.revoke) patch.revoked_at = new Date().toISOString();
      await db.from('integration_keys').update(patch).eq('id', u.data.id).eq('pharmacy_id', account.pharmacyId);
      await audit(account.pharmacyId, u.data.revoke ? 'integration.key_revoked' : 'integration.key_updated', staff, account.authUserId, patch, { table: 'integration_keys', id: u.data.id });
      return NextResponse.json({ ok: true });
    }

    const c = Create.safeParse(body);
    if (!c.success) return NextResponse.json({ error: 'Give the connection a name' }, { status: 400 });
    const key = newIntegrationKey();
    const { data, error } = await db
      .from('integration_keys')
      .insert({ pharmacy_id: account.pharmacyId, name: c.data.name, key_prefix: key.slice(0, 17), key_hash: hashKey(key), created_by_staff_id: staff.id, created_by_auth_user: account.authUserId })
      .select('id')
      .single();
    if (error) throw error;
    await audit(account.pharmacyId, 'integration.key_created', staff, account.authUserId, { name: c.data.name }, { table: 'integration_keys', id: data.id });
    return NextResponse.json({ id: data.id, key });
  } catch (err) {
    return errorResponse(err);
  }
}
