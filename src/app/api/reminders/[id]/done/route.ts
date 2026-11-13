import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { advance, type Frequency } from '@/lib/reminders';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const Body = z.object({ action: z.enum(['recorded', 'skipped']), recorded: z.number().int().min(0).optional() });

/**
 * The supplies themselves are recorded line by line through /api/entries (signed, checked for
 * balance and duplicates). This only moves the reminder on to its next date.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    const db = createServiceClient();
    const { data: r } = await db.from('dispense_reminders').select('*').eq('id', params.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!r) return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    const today = new Date().toISOString().slice(0, 10);
    const next = advance(r.next_due, r.frequency as Frequency, r.interval_days, today);
    const { data, error } = await db.from('dispense_reminders').update({ next_due: next, last_done_on: today, last_done_by_name: staff.full_name, updated_at: new Date().toISOString() }).eq('id', r.id).select('*').single();
    if (error) throw error;
    await audit(account.pharmacyId, `reminder.${parsed.data.action}`, staff, account.authUserId, { title: r.title, due: r.next_due, next_due: next, recorded: parsed.data.recorded ?? 0 }, { table: 'dispense_reminders', id: r.id });
    return NextResponse.json({ reminder: data });
  } catch (err) {
    return errorResponse(err);
  }
}
