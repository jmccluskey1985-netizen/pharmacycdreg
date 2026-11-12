import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit, HttpError } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';
const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Waitlist sign-ups from the home page. Site owner only (ADMIN_EMAILS).
export async function GET(req: Request) {
  try {
    const { account, staff } = await requireStaff();
    if (!isSiteAdmin(account.email)) throw new HttpError(404, 'Not found');
    const db = createServiceClient();
    const { data, error } = await db.from('waitlist').select('*').order('created_at', { ascending: false }).limit(5000);
    if (error) throw error;
    await audit(account.pharmacyId, 'admin.waitlist_viewed', staff, account.authUserId, { count: data?.length ?? 0 });
    if (new URL(req.url).searchParams.get('format') === 'csv') {
      const cols = ['created_at', 'name', 'pharmacy_name', 'email', 'phone', 'dispensing_system', 'consent_contact', 'notes'];
      const body = [cols.join(','), ...(data ?? []).map((r: any) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
      return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="waitlist-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ waitlist: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
