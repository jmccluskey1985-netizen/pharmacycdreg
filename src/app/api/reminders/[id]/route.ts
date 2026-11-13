import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { ReminderBody } from '@/lib/reminders';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = ReminderBody.partial().safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the reminder details' }, { status: 400 });
    const b = parsed.data;
    const db = createServiceClient();
    if (b.lines) {
      const regIds = Array.from(new Set(b.lines.map((l) => l.register_id)));
      const { data: regs } = await db.from('cd_registers').select('id').in('id', regIds).eq('pharmacy_id', account.pharmacyId);
      if ((regs ?? []).length !== regIds.length) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    }
    const { data, error } = await db.from('dispense_reminders').update({ ...b, updated_at: new Date().toISOString() }).eq('id', params.id).eq('pharmacy_id', account.pharmacyId).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    await audit(account.pharmacyId, 'reminder.updated', staff, account.authUserId, { fields: Object.keys(b) }, { table: 'dispense_reminders', id: params.id });
    return NextResponse.json({ reminder: data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const db = createServiceClient();
    const { data } = await db.from('dispense_reminders').delete().eq('id', params.id).eq('pharmacy_id', account.pharmacyId).select('title').maybeSingle();
    if (!data) return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    await audit(account.pharmacyId, 'reminder.deleted', staff, account.authUserId, { title: data.title }, { table: 'dispense_reminders', id: params.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
