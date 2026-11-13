import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(300),
  destroyed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  witness_name: z.string().trim().max(120).optional().nullable(),
  witness_role: z.string().trim().max(120).optional().nullable(),
  destruction_method: z.string().trim().max(120).optional().nullable(),
});

// Record the destruction of returned / Sch 3–4 items. Destroyed by the signed-in staff member;
// a second person as witness is good practice (PSI) though not an authorised witness.
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Choose the items and the date' }, { status: 400 });
    const b = parsed.data;
    if (b.destroyed_date > new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: 'The date can’t be in the future' }, { status: 400 });
    const db = createServiceClient();
    const { data, error } = await db.from('destruction_book').update({
      destroyed_date: b.destroyed_date, destroyed_by_staff_id: staff.id, destroyed_by_name: staff.full_name,
      witness_name: b.witness_name || null, witness_role: b.witness_role || null, destruction_method: b.destruction_method || null,
    }).in('id', b.ids).eq('pharmacy_id', account.pharmacyId).is('destroyed_date', null).select('id');
    if (error) throw error;
    await audit(account.pharmacyId, 'destruction_book.destroyed', staff, account.authUserId, { items: data?.length ?? 0, witness: b.witness_name });
    return NextResponse.json({ ok: true, count: data?.length ?? 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
