import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit, pharmacyPermissions } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy } from '@/lib/registers';
import { EntrySchema } from '@/lib/entry-schema';
import { productTitle } from '@/lib/product-name';
import { permits } from '@/lib/permissions';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';
const DRAFTABLE = ['receipt', 'supply', 'patient_return'];

/**
 * Register entries prepared by someone who may not sign (e.g. a technician). A draft changes no
 * balance; a pharmacist checks and signs it in "To confirm", which posts it through /api/entries.
 */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff('draftEntries', { write: true });
    const parsed = EntrySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Some required register details are missing', issues: parsed.error.flatten() }, { status: 400 });
    const e = parsed.data as any;
    if (!DRAFTABLE.includes(e.entry_type)) return NextResponse.json({ error: 'Only receipts, supplies and patient returns can be drafted. Ask a pharmacist for the rest.' }, { status: 400 });
    const reg = await getRegisterForPharmacy(e.register_id, account.pharmacyId);
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    if (reg.closed_at) return NextResponse.json({ error: 'This register is closed' }, { status: 409 });
    const { register_id, draft_id: _d, inbox_id: _i, allow_duplicate: _a, duplicate_reason: _r, ...payload } = e;
    const db = createServiceClient();
    const { data, error } = await db.from('entry_drafts').insert({ pharmacy_id: account.pharmacyId, register_id, payload, drafted_by_staff_id: staff.id, drafted_by_name: staff.full_name }).select('id').single();
    if (error) {
      if (/entry_drafts/.test(error.message)) return NextResponse.json({ error: 'Drafts need a one-off database update (migration 0024).' }, { status: 503 });
      throw error;
    }
    await audit(account.pharmacyId, 'entry.drafted', staff, account.authUserId, { register: productTitle(reg.product), entry_type: e.entry_type, quantity: e.quantity, transaction_date: e.transaction_date }, { table: 'entry_drafts', id: data.id });
    return NextResponse.json({ draft_id: data.id, drafted: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Pending drafts: for pharmacists to sign, and for the people who may draft (to see what's waiting). */
export async function GET() {
  try {
    const { account, staff } = await requireStaff();
    if (!can.record(staff.role) && !permits(staff.role, 'draftEntries', await pharmacyPermissions(account.pharmacyId))) return NextResponse.json({ drafts: [] });
    const db = createServiceClient();
    const { data, error } = await db.from('entry_drafts').select('id, register_id, payload, drafted_by_name, drafted_by_staff_id, drafted_at, register:cd_registers(id, product:cd_products(*))')
      .eq('pharmacy_id', account.pharmacyId).eq('status', 'pending').order('drafted_at', { ascending: true }).limit(200);
    if (error) return NextResponse.json({ drafts: [] }); // before migration 0024
    return NextResponse.json({ drafts: (data ?? []).map((d: any) => ({ ...d, label: d.register?.product ? productTitle(d.register.product) : 'Register', unit: d.register?.product?.unit ?? 'units', register: undefined, mine: d.drafted_by_staff_id === staff.id })) });
  } catch (err) {
    return errorResponse(err);
  }
}
