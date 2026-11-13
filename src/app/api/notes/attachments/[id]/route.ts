import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { NOTES_BUCKET } from '@/lib/notes';

export const dynamic = 'force-dynamic';

async function find(id: string, pharmacyId: string) {
  const db = createServiceClient();
  const { data } = await db.from('note_attachments').select('*').eq('id', id).eq('pharmacy_id', pharmacyId).maybeSingle();
  return { db, att: data as any };
}

// Stream the file to a signed-in staff member of the same pharmacy (never a public URL).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireStaff();
    const { db, att } = await find(params.id, account.pharmacyId);
    if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data, error } = await db.storage.from(NOTES_BUCKET).download(att.storage_path);
    if (error || !data) return NextResponse.json({ error: 'File not available' }, { status: 404 });
    return new Response(data, { headers: { 'Content-Type': att.mime_type, 'Content-Disposition': `inline; filename="${att.file_name}"`, 'Cache-Control': 'private, max-age=300' } });
  } catch (err) {
    return errorResponse(err);
  }
}

// Remove an attachment added by mistake (e.g. the wrong photo). Audited.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff((r) => r !== 'read_only', { write: true });
    const { db, att } = await find(params.id, account.pharmacyId);
    if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await db.storage.from(NOTES_BUCKET).remove([att.storage_path]);
    await db.from('note_attachments').delete().eq('id', att.id);
    await audit(account.pharmacyId, 'note.attachment_removed', staff, account.authUserId, { file_name: att.file_name }, { table: 'notes', id: att.note_id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
