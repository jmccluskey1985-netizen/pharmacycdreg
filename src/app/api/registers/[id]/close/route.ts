import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { balancesFor } from '@/lib/registers';
import { can } from '@/lib/roles';

// Close a register (product no longer stocked). It stays readable, searchable and
// exportable for inspection; it just can't take new entries. Balance must be nil.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { account, staff } = await requireStaff(can.manageStaff);
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
    if (reason.length < 5) return NextResponse.json({ error: 'Say why the book is being closed' }, { status: 400 });
    const db = createServiceClient();
    const { data: reg } = await db.from('cd_registers').select('id, closed_at').eq('id', params.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    if (reg.closed_at) return NextResponse.json({ error: 'Already closed' }, { status: 409 });
    const balance = (await balancesFor([params.id]))[params.id] ?? 0;
    if (balance !== 0) return NextResponse.json({ error: `Balance is ${balance}. Record the destruction or return of the remaining stock first. A register can only be closed at nil.` }, { status: 409 });
    await db.from('cd_registers').update({ closed_at: new Date().toISOString(), closed_by_staff_id: staff.id }).eq('id', params.id);
    await audit(account.pharmacyId, 'register.closed', staff, account.authUserId, { reason }, { table: 'cd_registers', id: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
