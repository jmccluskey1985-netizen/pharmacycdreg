import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const Contact = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(['prescriber', 'supplier', 'witness']),
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().max(300).optional().nullable(),
  registration: z.string().trim().max(40).optional().nullable(),
  gms_number: z.string().trim().max(40).optional().nullable(),
  role: z.string().trim().max(80).optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function GET() {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const { data } = await db.from('contacts').select('*').eq('pharmacy_id', account.pharmacyId).eq('is_active', true).order('kind').order('name');
    return NextResponse.json({ contacts: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

// Add/edit one contact, or bulk add: { contacts: [...] } (e.g. a pasted list of GMS doctors).
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record);
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();
    const list = Array.isArray(body.contacts) ? body.contacts : [body];
    const parsed = z.array(Contact).max(500).safeParse(list);
    if (!parsed.success) return NextResponse.json({ error: 'Check the details (name is required)' }, { status: 400 });

    let added = 0;
    for (const c of parsed.data) {
      const row = { ...c, pharmacy_id: account.pharmacyId, updated_at: new Date().toISOString() };
      if (c.id) {
        await db.from('contacts').update(row).eq('id', c.id).eq('pharmacy_id', account.pharmacyId);
      } else {
        // skip exact duplicates (same kind + name + address)
        const { data: dup } = await db.from('contacts').select('id').eq('pharmacy_id', account.pharmacyId).eq('kind', c.kind).ilike('name', c.name).eq('is_active', true).limit(1);
        if (dup?.length) continue;
        await db.from('contacts').insert(row);
        added++;
      }
    }
    await audit(account.pharmacyId, 'contacts.saved', staff, account.authUserId, { count: parsed.data.length, added });
    return NextResponse.json({ ok: true, added });
  } catch (err) {
    return errorResponse(err);
  }
}
