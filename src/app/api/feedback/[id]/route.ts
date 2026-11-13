import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  status: z.enum(['new', 'read', 'planned', 'in_progress', 'done', 'declined']).optional(),
  reply: z.string().trim().max(4000).optional().nullable(),
  shared: z.boolean().optional(),
  shared_title: z.string().trim().max(200).optional().nullable(),
});

// Site owner only: set status, reply, and share an idea (with a tidied title) for everyone to vote on.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireStaff();
    if (!isSiteAdmin(account.email)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const parsed = Patch.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    if (parsed.data.shared && !parsed.data.shared_title) return NextResponse.json({ error: 'Give the shared idea a title (it’s shown to every pharmacy)' }, { status: 400 });
    const db = createServiceClient();
    const { data, error } = await db.from('feedback').update({ ...parsed.data, updated_at: new Date().toISOString() }).eq('id', params.id).select('*').maybeSingle();
    if (error) throw error;
    return NextResponse.json({ feedback: data });
  } catch (err) {
    return errorResponse(err);
  }
}
