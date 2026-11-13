import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { currentBalance } from '@/lib/registers';
import { can } from '@/lib/roles';

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  witness_name: z.string().trim().min(2).max(120),
  witness_role: z.string().trim().min(2).max(120),
  destruction_method: z.string().trim().max(120).optional().nullable(),
});

/**
 * Witnessed destruction of quarantined Schedule 2 stock. For each register, one 'destruction'
 * line is written to that drug's register (reducing the balance) with the authorised witness,
 * and the quarantine items are closed against it.
 */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Choose the items and enter the witness and their capacity' }, { status: 400 });
    const b = parsed.data;
    if (b.transaction_date > new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: 'The date can’t be in the future' }, { status: 400 });
    const db = createServiceClient();
    const { data: items } = await db.from('quarantine_items').select('*').in('id', b.ids).eq('pharmacy_id', account.pharmacyId).eq('status', 'awaiting');
    if (!items?.length) return NextResponse.json({ error: 'Nothing awaiting destruction was chosen' }, { status: 404 });

    const byRegister = new Map<string, any[]>();
    for (const it of items) byRegister.set(it.register_id, [...(byRegister.get(it.register_id) ?? []), it]);
    const done: { register_id: string; seq: number; quantity: number }[] = [];
    for (const [registerId, group] of byRegister) {
      const qty = group.reduce((n, i) => n + Number(i.quantity), 0);
      const balance = await currentBalance(registerId);
      if (qty > balance) return NextResponse.json({ error: `The register balance (${balance}) is less than the ${qty} to destroy: check the register first.` }, { status: 409 });
      const detail = group.map((i) => [i.reason, i.batch && `batch ${i.batch}`, i.expiry_date && `exp ${i.expiry_date.split('-').reverse().join('/')}`].filter(Boolean).join(' ')).join('; ');
      const { data: entry, error } = await db.from('cd_entries').insert({
        register_id: registerId, entry_type: 'destruction', transaction_date: b.transaction_date, quantity: qty,
        witness_name: b.witness_name, witness_role: b.witness_role, destruction_method: b.destruction_method || null,
        notes: `Quarantined stock: ${detail}`.slice(0, 500),
        recorded_by_staff_id: staff.id, recorded_by_auth_user: account.authUserId, source: 'manual',
      }).select('id, seq').single();
      if (error) throw error;
      await db.from('quarantine_items').update({ status: 'destroyed', destroyed_entry_id: entry.id, resolved_by_staff_id: staff.id, resolved_at: new Date().toISOString() }).in('id', group.map((i) => i.id));
      done.push({ register_id: registerId, seq: entry.seq, quantity: qty });
    }
    await audit(account.pharmacyId, 'quarantine.destroyed', staff, account.authUserId, { items: b.ids.length, witness: b.witness_name, witness_role: b.witness_role, registers: done });
    return NextResponse.json({ ok: true, done });
  } catch (err) {
    return errorResponse(err);
  }
}
