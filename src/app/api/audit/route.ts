import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { account } = await requireStaff(can.viewAudit);
    const before = new URL(req.url).searchParams.get('before');
    const db = createServiceClient();
    let q = db.from('audit_log').select('*').eq('pharmacy_id', account.pharmacyId).order('id', { ascending: false }).limit(100);
    if (before) q = q.lt('id', Number(before));
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ events: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
