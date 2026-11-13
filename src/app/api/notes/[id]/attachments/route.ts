import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT, NOTES_BUCKET, missing0012, NEEDS_0012 } from '@/lib/notes';

export const dynamic = 'force-dynamic';

// Attach a photo / scan / PDF to a note. Stored in a private bucket; only served through the app.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff((r) => r !== 'read_only', { write: true });
    const db = createServiceClient();
    const { data: note, error: nErr } = await db.from('notes').select('id').eq('id', params.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (nErr && missing0012(nErr.message)) return NextResponse.json({ error: NEEDS_0012 }, { status: 409 });
    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo or PDF' }, { status: 400 });
    if (!ATTACHMENT_TYPES.includes(file.type)) return NextResponse.json({ error: 'Photos (JPG, PNG, HEIC) or PDF only' }, { status: 400 });
    if (file.size > MAX_ATTACHMENT) return NextResponse.json({ error: 'That file is too large (4 MB max)' }, { status: 400 });
    const safe = (file.name || 'photo').replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${account.pharmacyId}/${params.id}/${crypto.randomUUID()}-${safe}`;
    const up = await db.storage.from(NOTES_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (up.error) return NextResponse.json({ error: /bucket/i.test(up.error.message) ? NEEDS_0012 : 'Could not save the file' }, { status: 500 });
    const { data, error } = await db.from('note_attachments').insert({ pharmacy_id: account.pharmacyId, note_id: params.id, storage_path: path, file_name: safe, mime_type: file.type, size_bytes: file.size, uploaded_by_name: staff.full_name }).select('id, file_name, mime_type, size_bytes, created_at').single();
    if (error) throw error;
    await db.from('notes').update({ updated_at: new Date().toISOString(), updated_by_name: staff.full_name }).eq('id', params.id);
    await audit(account.pharmacyId, 'note.attachment_added', staff, account.authUserId, { file_name: safe }, { table: 'notes', id: params.id });
    return NextResponse.json({ attachment: data });
  } catch (err) {
    return errorResponse(err);
  }
}
