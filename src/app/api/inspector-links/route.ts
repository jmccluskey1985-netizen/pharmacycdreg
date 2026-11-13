import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';
import { hashToken, newToken } from '@/lib/inspector';

export const dynamic = 'force-dynamic';
const NEEDS = 'Needs a one-off database update first (run migration 0013 in Supabase).';

export async function GET() {
  try {
    const { account } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const { data, error } = await db.from('inspector_links').select('id, label, expires_at, revoked_at, created_by_name, created_at, last_used_at, use_count').eq('pharmacy_id', account.pharmacyId).order('created_at', { ascending: false }).limit(50);
    if (error) return NextResponse.json({ links: [], needs_migration: true });
    return NextResponse.json({ links: data });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({ label: z.string().trim().min(2).max(120), hours: z.number().int().min(1).max(24 * 14) });

/** A read-only link for an inspector. The token is returned ONCE; only its hash is stored. */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.manageStaff);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Say who it’s for' }, { status: 400 });
    const token = newToken();
    const db = createServiceClient();
    const expires = new Date(Date.now() + parsed.data.hours * 3600_000).toISOString();
    const { data, error } = await db.from('inspector_links').insert({ pharmacy_id: account.pharmacyId, token_hash: hashToken(token), label: parsed.data.label, expires_at: expires, created_by_staff_id: staff.id, created_by_name: staff.full_name }).select('id').single();
    if (error) return NextResponse.json({ error: NEEDS }, { status: 409 });
    await audit(account.pharmacyId, 'inspector_link.created', staff, account.authUserId, { label: parsed.data.label, expires_at: expires }, { table: 'inspector_links', id: data.id });
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    return NextResponse.json({ id: data.id, url: `${origin}/inspect/${token}`, expires_at: expires });
  } catch (err) {
    return errorResponse(err);
  }
}
