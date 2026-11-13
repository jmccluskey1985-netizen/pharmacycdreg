import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy, currentBalance } from '@/lib/registers';
import { productTitle } from '@/lib/product-name';
import { NEEDS_0011, missingTable, quarantinedFor } from '@/lib/quarantine';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Stock awaiting destruction (and recently closed), across the pharmacy or for one register.
export async function GET(req: Request) {
  try {
    const { account } = await requireStaff();
    const registerId = new URL(req.url).searchParams.get('register_id');
    const db = createServiceClient();
    let q = db.from('quarantine_items').select('*, register:cd_registers(id, product:cd_products(*))').eq('pharmacy_id', account.pharmacyId).order('created_at', { ascending: false }).limit(300);
    if (registerId) q = q.eq('register_id', registerId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ items: [], needs_migration: missingTable(error.message) });
    const items = (data ?? []).map((r: any) => ({ ...r, label: r.register?.product ? productTitle(r.register.product) : 'Unknown register', unit: r.register?.product?.unit ?? 'units', register: undefined }));
    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  register_id: z.string().uuid(),
  quantity: z.coerce.number().positive().max(1_000_000),
  reason: z.enum(['expired', 'damaged', 'recalled', 'other']),
  batch: z.string().trim().max(60).optional().nullable(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

// Set stock aside in the CD safe, labelled for destruction. It stays in the balance.
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Enter the amount and the reason' }, { status: 400 });
    const b = parsed.data;
    const reg = await getRegisterForPharmacy(b.register_id, account.pharmacyId);
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const db = createServiceClient();
    const balance = await currentBalance(reg.id);
    const already = (await quarantinedFor(db, account.pharmacyId, [reg.id]))[reg.id] ?? 0;
    if (already + b.quantity > balance) return NextResponse.json({ error: `Only ${balance - already} ${reg.product.unit} in stock that isn’t already set aside.` }, { status: 409 });
    const { data, error } = await db.from('quarantine_items').insert({ ...b, batch: b.batch || null, expiry_date: b.expiry_date || null, notes: b.notes || null, pharmacy_id: account.pharmacyId, created_by_staff_id: staff.id }).select('*').single();
    if (error) return NextResponse.json({ error: missingTable(error.message) ? NEEDS_0011 : 'Could not save' }, { status: missingTable(error.message) ? 409 : 500 });
    await audit(account.pharmacyId, 'quarantine.added', staff, account.authUserId, { register_id: reg.id, quantity: b.quantity, reason: b.reason, batch: b.batch, expiry_date: b.expiry_date }, { table: 'quarantine_items', id: data.id });
    return NextResponse.json({ item: data });
  } catch (err) {
    return errorResponse(err);
  }
}
