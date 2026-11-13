import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { balancesFor } from '@/lib/registers';
import { productTitle } from '@/lib/product-name';
import { ReminderBody } from '@/lib/reminders';
import { missing0012, NEEDS_0012 } from '@/lib/notes';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/** Reminders with each line's register label, unit and current balance. */
export async function GET() {
  try {
    const { account } = await requireStaff(can.record);
    const db = createServiceClient();
    const { data, error } = await db.from('dispense_reminders').select('*').eq('pharmacy_id', account.pharmacyId).order('active', { ascending: false }).order('next_due');
    if (error) return NextResponse.json({ reminders: [], needs_migration: missing0012(error.message) });
    const ids = Array.from(new Set((data ?? []).flatMap((r: any) => (r.lines ?? []).map((l: any) => l.register_id))));
    const { data: regs } = ids.length ? await db.from('cd_registers').select('id, closed_at, product:cd_products(*)').in('id', ids).eq('pharmacy_id', account.pharmacyId) : { data: [] as any[] };
    const bal = await balancesFor(ids);
    const byId = new Map((regs ?? []).map((r: any) => [r.id, r]));
    const today = new Date().toISOString().slice(0, 10);
    const reminders = (data ?? []).map((r: any) => ({
      ...r,
      due: r.active && r.next_due <= today,
      lines: (r.lines ?? []).map((l: any) => {
        const reg: any = byId.get(l.register_id);
        return { ...l, label: reg ? productTitle(reg.product) : 'Register not found', unit: reg?.product?.unit ?? 'units', balance: bal[l.register_id] ?? 0, closed: !reg || !!reg.closed_at };
      }),
    }));
    return NextResponse.json({ reminders });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = ReminderBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the reminder details' }, { status: 400 });
    const b = parsed.data;
    if (b.frequency === 'custom' && !b.interval_days) return NextResponse.json({ error: 'How many days between supplies?' }, { status: 400 });
    const db = createServiceClient();
    const regIds = Array.from(new Set(b.lines.map((l) => l.register_id)));
    const { data: regs } = await db.from('cd_registers').select('id').in('id', regIds).eq('pharmacy_id', account.pharmacyId);
    if ((regs ?? []).length !== regIds.length) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const { data, error } = await db.from('dispense_reminders').insert({ ...b, interval_days: b.frequency === 'custom' ? b.interval_days : null, pharmacy_id: account.pharmacyId, created_by_staff_id: staff.id, created_by_name: staff.full_name }).select('*').single();
    if (error) {
      if (missing0012(error.message)) return NextResponse.json({ error: NEEDS_0012 }, { status: 409 });
      throw error;
    }
    await audit(account.pharmacyId, 'reminder.created', staff, account.authUserId, { title: b.title, frequency: b.frequency, lines: b.lines.length }, { table: 'dispense_reminders', id: data.id });
    return NextResponse.json({ reminder: data });
  } catch (err) {
    return errorResponse(err);
  }
}
