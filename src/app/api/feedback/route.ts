import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/admin';
import { adminEmail, sendEmail } from '@/lib/email';
import { missing0012, NEEDS_0012 } from '@/lib/notes';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * mine: this pharmacy's own feedback (with replies). ideas: ideas the site owner has shared for
 * everyone to vote on (title only — never another pharmacy's words or name). all: site owner only.
 */
export async function GET() {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const admin = isSiteAdmin(account.email);
    const [mine, shared, votes, mineVotes] = await Promise.all([
      db.from('feedback').select('*').eq('pharmacy_id', account.pharmacyId).order('created_at', { ascending: false }).limit(200),
      db.from('feedback').select('id, kind, status, shared_title, reply, created_at').eq('shared', true).order('created_at', { ascending: false }).limit(200),
      db.from('feedback_votes').select('feedback_id'),
      db.from('feedback_votes').select('feedback_id').eq('pharmacy_id', account.pharmacyId),
    ]);
    if (mine.error) return NextResponse.json({ mine: [], ideas: [], needs_migration: missing0012(mine.error.message) });
    const count: Record<string, number> = {};
    for (const v of votes.data ?? []) count[v.feedback_id] = (count[v.feedback_id] ?? 0) + 1;
    const voted = new Set((mineVotes.data ?? []).map((v) => v.feedback_id));
    const ideas = (shared.data ?? []).map((f) => ({ ...f, votes: count[f.id] ?? 0, voted: voted.has(f.id) })).sort((a, b) => b.votes - a.votes);
    let all = null;
    if (admin) {
      const { data } = await db.from('feedback').select('*').order('created_at', { ascending: false }).limit(500);
      all = (data ?? []).map((f) => ({ ...f, votes: count[f.id] ?? 0 }));
    }
    return NextResponse.json({ mine: mine.data, ideas, all, is_admin: admin });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({ kind: z.enum(['idea', 'problem', 'other']), message: z.string().trim().min(3).max(4000), page: z.string().max(200).optional().nullable() });

export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Write a little more' }, { status: 400 });
    const db = createServiceClient();
    const { data: ph } = await db.from('pharmacies').select('name').eq('id', account.pharmacyId).single();
    const { data, error } = await db.from('feedback').insert({ ...parsed.data, pharmacy_id: account.pharmacyId, pharmacy_name: ph?.name ?? null, staff_name: staff.full_name }).select('*').single();
    if (error) {
      if (missing0012(error.message)) return NextResponse.json({ error: NEEDS_0012 }, { status: 409 });
      throw error;
    }
    await audit(account.pharmacyId, 'feedback.sent', staff, account.authUserId, { kind: parsed.data.kind }, { table: 'feedback', id: data.id });
    const to = adminEmail();
    if (to) await sendEmail({ to, subject: `CDReg ${parsed.data.kind}: ${parsed.data.message.slice(0, 60)}`, html: `<p><b>${esc(ph?.name ?? '')}</b> — ${esc(staff.full_name)}</p><p style="white-space:pre-wrap">${esc(parsed.data.message)}</p>` }).catch(() => {});
    return NextResponse.json({ feedback: data });
  } catch (err) {
    return errorResponse(err);
  }
}
