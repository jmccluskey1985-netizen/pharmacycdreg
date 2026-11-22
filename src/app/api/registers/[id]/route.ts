import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy } from '@/lib/registers';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// One register "book": the effective ledger + every raw row (originals and corrections)
// so the page can show struck-through originals with footnotes (FR11, NFR5).
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { account, staff } = await requireStaff();
    const reg = await getRegisterForPharmacy(params.id, account.pharmacyId);
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const db = createServiceClient();
    const [ledger, raw, staffRows, checkRows] = await Promise.all([
      db.from('cd_ledger').select('*').eq('register_id', reg.id).order('seq'),
      db.from('cd_entries').select('*').eq('register_id', reg.id).order('seq'),
      db.from('staff').select('id, full_name, psi_number, role').eq('pharmacy_id', account.pharmacyId),
      db.from('stock_checks').select('id, counted, register_balance, notes, checked_by_staff_id, checked_by_name, checked_at').eq('pharmacy_id', account.pharmacyId).eq('register_id', reg.id).order('checked_at'),
    ]);
    // Completed stock checks are shown as lines in the book: which full stock count each came from
    const checks: Record<string, unknown>[] = checkRows.data ?? [];
    if (checks.length) {
      const { data: countLines } = await db.from('stock_count_lines').select('stock_check_id, count_id').in('stock_check_id', checks.map((c) => c.id as string));
      const countIds = [...new Set((countLines ?? []).map((l) => l.count_id))];
      const { data: counts } = countIds.length ? await db.from('stock_counts').select('id, started_at').in('id', countIds) : { data: [] };
      const started = new Map((counts ?? []).map((c) => [c.id, c.started_at]));
      const byCheck = new Map((countLines ?? []).map((l) => [l.stock_check_id, started.get(l.count_id) ?? null]));
      for (const c of checks) c.count_started_at = byCheck.get(c.id as string) ?? null;
    }
    await audit(account.pharmacyId, 'register.viewed', staff, account.authUserId, {}, { table: 'cd_registers', id: reg.id });
    return NextResponse.json({ register: reg, ledger: ledger.data ?? [], entries: raw.data ?? [], staff: staffRows.data ?? [], checks });
  } catch (err) {
    return errorResponse(err);
  }
}

// Remove a CD book that was never used (opened by mistake, or a "start" you don't stock).
// Only when it has NO entries at all, a register with any line, even corrected, is kept forever.
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { account, staff } = await requireStaff('openRegister');
    const db = createServiceClient();
    const { data: reg } = await db.from('cd_registers').select('id, product_id').eq('id', params.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const { count } = await db.from('cd_entries').select('id', { count: 'exact', head: true }).eq('register_id', reg.id);
    if ((count ?? 0) > 0) return NextResponse.json({ error: 'This CD book has entries, so it’s part of the legal record and can’t be removed. Close it instead once the balance is nil.' }, { status: 409 });
    await db.from('pmr_inbox').update({ register_id: null }).eq('register_id', reg.id); // unlink any waiting Halo item
    const { error } = await db.from('cd_registers').delete().eq('id', reg.id);
    if (error) throw error;
    await audit(account.pharmacyId, 'register.removed_unused', staff, account.authUserId, { product_id: reg.product_id }, { table: 'cd_registers', id: reg.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
