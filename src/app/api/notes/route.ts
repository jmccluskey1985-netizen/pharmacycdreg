import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { productTitle } from '@/lib/product-name';
import { createNote, missing0012, NEEDS_0012 } from '@/lib/notes';

export const dynamic = 'force-dynamic';

// Notes for the pharmacy: pinned first, then most recently updated. ?register_id= for one book.
export async function GET(req: Request) {
  try {
    const { account } = await requireStaff();
    const u = new URL(req.url);
    const db = createServiceClient();
    let q = db.from('notes').select('*, register:cd_registers(id, product:cd_products(*)), attachments:note_attachments(id, file_name, mime_type, size_bytes, created_at)')
      .eq('pharmacy_id', account.pharmacyId).eq('archived', u.searchParams.get('archived') === '1')
      .order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(300);
    const reg = u.searchParams.get('register_id');
    if (reg) q = q.eq('register_id', reg);
    const { data, error } = await q;
    if (error) return NextResponse.json({ notes: [], needs_migration: missing0012(error.message) });
    return NextResponse.json({ notes: (data ?? []).map((n: any) => ({ ...n, register_label: n.register?.product ? productTitle(n.register.product) : null, register: undefined })) });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  title: z.string().trim().min(2).max(200),
  body: z.string().max(20000).optional().default(''),
  category: z.string().trim().max(60).optional().nullable(),
  register_id: z.string().uuid().optional().nullable(),
  stock_check_id: z.string().uuid().optional().nullable(),
  pinned: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff((r) => r !== 'read_only', { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Give the note a title' }, { status: 400 });
    const db = createServiceClient();
    if (parsed.data.register_id) {
      const { data: reg } = await db.from('cd_registers').select('id').eq('id', parsed.data.register_id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
      if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    }
    try {
      const note = await createNote(db, account.pharmacyId, staff, parsed.data);
      await audit(account.pharmacyId, 'note.created', staff, account.authUserId, { title: note.title }, { table: 'notes', id: note.id });
      return NextResponse.json({ note });
    } catch (e: any) {
      if (missing0012(e?.message)) return NextResponse.json({ error: NEEDS_0012 }, { status: 409 });
      throw e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
