import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  body: z.string().max(20000).optional(),
  category: z.string().trim().max(60).optional().nullable(),
  register_id: z.string().uuid().optional().nullable(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

// Edit a note. The previous text is kept in the audit trail, so nothing is silently lost.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff((r) => r !== 'read_only', { write: true });
    const parsed = Patch.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the note details' }, { status: 400 });
    const db = createServiceClient();
    const { data: old } = await db.from('notes').select('*').eq('id', params.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!old) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    if (parsed.data.register_id) {
      const { data: reg } = await db.from('cd_registers').select('id').eq('id', parsed.data.register_id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
      if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    }
    const { data, error } = await db.from('notes').update({ ...parsed.data, updated_by_name: staff.full_name, updated_at: new Date().toISOString() }).eq('id', params.id).select('*').single();
    if (error) throw error;
    const changed = Object.keys(parsed.data).filter((k) => (old as any)[k] !== (parsed.data as any)[k]);
    await audit(account.pharmacyId, parsed.data.archived ? 'note.archived' : 'note.updated', staff, account.authUserId,
      { changed, previous: Object.fromEntries(changed.map((k) => [k, (old as any)[k]])) }, { table: 'notes', id: params.id });
    return NextResponse.json({ note: data });
  } catch (err) {
    return errorResponse(err);
  }
}
