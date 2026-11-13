import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { NEEDS_0011, missingTable } from '@/lib/quarantine';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// The CD Destruction Record Book: patient returns (Sch 2–4) and expired Schedule 3/4 stock.
export async function GET() {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const { data, error } = await db.from('destruction_book').select('*').eq('pharmacy_id', account.pharmacyId).order('received_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
    if (error) return NextResponse.json({ rows: [], needs_migration: missingTable(error.message) });
    return NextResponse.json({ rows: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  kind: z.enum(['patient_return', 'stock_sch34']),
  drug: z.string().trim().min(2).max(160),
  schedule: z.coerce.number().int().min(2).max(5).optional().nullable(),
  quantity: z.coerce.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(30),
  batch: z.string().trim().max(60).optional().nullable(),
  expiry_date: date.optional().nullable(),
  returned_by_name: z.string().trim().max(160).optional().nullable(),
  returned_by_address: z.string().trim().max(300).optional().nullable(),
  received_date: date,
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the drug, amount and date' }, { status: 400 });
    const b = parsed.data;
    if (b.kind === 'patient_return' && (b.returned_by_name ?? '').length < 2) return NextResponse.json({ error: 'Enter who returned it' }, { status: 400 });
    const db = createServiceClient();
    const clean = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v === '' ? null : v]));
    const { data, error } = await db.from('destruction_book').insert({ ...clean, pharmacy_id: account.pharmacyId, received_by_staff_id: staff.id, received_by_name: staff.full_name }).select('*').single();
    if (error) return NextResponse.json({ error: missingTable(error.message) ? NEEDS_0011 : 'Could not save' }, { status: missingTable(error.message) ? 409 : 500 });
    await audit(account.pharmacyId, `destruction_book.${b.kind}_received`, staff, account.authUserId, { drug: b.drug, quantity: b.quantity }, { table: 'destruction_book', id: data.id });
    return NextResponse.json({ row: data });
  } catch (err) {
    return errorResponse(err);
  }
}
