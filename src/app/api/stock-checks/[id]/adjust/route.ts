import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { currentBalance, getRegisterForPharmacy } from '@/lib/registers';
import { createNote, missing0012, NEEDS_0012 } from '@/lib/notes';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const Body = z.object({
  investigation: z.string().trim().min(10, 'Say what you did to investigate (at least a sentence)').max(4000),
  save_note: z.boolean().optional(),
  note_title: z.string().trim().max(200).optional().nullable(),
});
const fmt = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * Bring the register balance into line with a stock check's physical count. Never an edit:
 * a new signed STOCK ADJUSTMENT line (in or out) carrying the explanation. Refused if the
 * register has moved on since the count (count again first). Optionally saves the
 * investigation as a note linked to the register and the stock check (photos can be added).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the details' }, { status: 400 });
    const b = parsed.data;
    const db = createServiceClient();
    const { data: check } = await db.from('stock_checks').select('*').eq('id', params.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!check) return NextResponse.json({ error: 'Stock check not found' }, { status: 404 });
    const reg = await getRegisterForPharmacy(check.register_id, account.pharmacyId);
    if (!reg || reg.closed_at) return NextResponse.json({ error: 'This register is closed' }, { status: 409 });
    const balance = await currentBalance(reg.id);
    if (balance !== Number(check.register_balance)) {
      return NextResponse.json({ error: 'The register has changed since this count. Do a new stock check, then amend from that.' }, { status: 409 });
    }
    const diff = Number(check.counted) - balance;
    if (diff === 0) return NextResponse.json({ error: 'The count already matches the register' }, { status: 409 });

    const notes = `Stock check ${fmt(check.checked_at)} by ${check.checked_by_name}: counted ${Number(check.counted)}, register ${balance} ${reg.product.unit} (${diff > 0 ? '+' : ''}${diff}). Investigation: ${b.investigation}`;
    const { data: entry, error } = await db.from('cd_entries').insert({
      register_id: reg.id, entry_type: diff > 0 ? 'adjustment_in' : 'adjustment_out', transaction_date: new Date().toISOString().slice(0, 10),
      quantity: Math.abs(diff), notes, source: 'manual', recorded_by_staff_id: staff.id, recorded_by_auth_user: account.authUserId,
    }).select('id, seq').single();
    if (error) {
      if (/invalid input value for enum|adjustment/i.test(error.message)) return NextResponse.json({ error: NEEDS_0012 }, { status: 409 });
      throw error;
    }
    await audit(account.pharmacyId, 'stock_check.balance_amended', staff, account.authUserId, { register_id: reg.id, stock_check_id: check.id, from: balance, to: Number(check.counted), diff }, { table: 'cd_entries', id: entry.id });

    let note: any = null;
    if (b.save_note) {
      note = await createNote(db, account.pharmacyId, staff, {
        title: b.note_title || `Stock discrepancy: ${reg.product.brand || reg.product.drug_name} ${reg.product.strength} (${diff > 0 ? '+' : ''}${diff})`,
        body: `${notes}\n\nRegister line ${entry.seq} records the adjustment.`, category: 'Stock discrepancy',
        register_id: reg.id, stock_check_id: check.id, entry_id: entry.id,
      }).catch((e) => (missing0012(e?.message) ? null : Promise.reject(e)));
    }
    return NextResponse.json({ entry, note, balance: Number(check.counted) });
  } catch (err) {
    return errorResponse(err);
  }
}
