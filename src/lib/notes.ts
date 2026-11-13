import type { SupabaseClient } from '@supabase/supabase-js';

export const NEEDS_0012 = 'Needs a one-off database update first (run migration 0012 in Supabase).';
export const missing0012 = (msg?: string) => /relation|does not exist|schema cache|column/i.test(msg ?? '');
export const NOTES_BUCKET = 'cd-notes';
export const MAX_ATTACHMENT = 4 * 1024 * 1024; // Vercel request limit is ~4.5MB; photos are compressed in the browser first
export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export interface NoteInput { title: string; body?: string; category?: string | null; register_id?: string | null; stock_check_id?: string | null; entry_id?: string | null; pinned?: boolean }

export async function createNote(db: SupabaseClient, pharmacyId: string, staff: { id: string; full_name: string }, n: NoteInput) {
  const { data, error } = await db.from('notes').insert({
    pharmacy_id: pharmacyId, title: n.title, body: n.body ?? '', category: n.category || null, pinned: !!n.pinned,
    register_id: n.register_id || null, stock_check_id: n.stock_check_id || null, entry_id: n.entry_id || null,
    created_by_staff_id: staff.id, created_by_name: staff.full_name, updated_by_name: staff.full_name,
  }).select('*').single();
  if (error) throw error;
  return data;
}
