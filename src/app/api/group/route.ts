import { NextResponse } from 'next/server';
import { requireStaff, pharmaciesFor, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isLead } from '@/lib/roles';
import { effectiveStatus } from '@/lib/stripe';
import { irishToday } from '@/lib/late-entry';

export const dynamic = 'force-dynamic';

const FREQ_DAYS: Record<string, number> = { weekly: 7, fortnightly: 14, monthly: 31 };

/**
 * Superintendent overview: one row per pharmacy this login is superintendent of. Counts and dates
 * only: no patient details. A pharmacy is included only while the person is still an active
 * superintendent there (or a lead pharmacist of the pharmacy they're signed in to).
 */
export async function GET() {
  try {
    const { account, staff } = await requireStaff(isLead);
    const db = createServiceClient();
    const all = await pharmaciesFor(account.authUserId, account.homePharmacyId ?? account.pharmacyId);
    const { data: links } = await db.from('pharmacy_logins').select('pharmacy_id, staff:staff_id(is_active, role)').eq('auth_user_id', account.authUserId);
    const allowed = new Set<string>([account.pharmacyId]);
    for (const l of (links ?? []) as any[]) if (l.staff?.is_active && l.staff?.role === 'superintendent_pharmacist') allowed.add(l.pharmacy_id);
    // Their home pharmacy counts if they're its superintendent too
    const home = account.homePharmacyId;
    if (home && home !== account.pharmacyId) {
      const { data: s } = await db.from('staff').select('id').eq('pharmacy_id', home).eq('role', 'superintendent_pharmacist').eq('is_active', true).limit(1);
      if (s?.length) allowed.add(home);
    }
    const list = all.filter((p) => allowed.has(p.id));
    const today = irishToday();
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

    const rows = await Promise.all(list.map(async (p) => {
      const [{ data: ph }, { data: regs }, rem, qa, book] = await Promise.all([
        db.from('pharmacies').select('id, name, address, subscription_status, subscription_id, trial_ends_at, current_period_end, stock_check_frequency').eq('id', p.id).single(),
        db.from('cd_registers').select('id').eq('pharmacy_id', p.id).is('closed_at', null),
        db.from('dispense_reminders').select('id', { count: 'exact', head: true }).eq('pharmacy_id', p.id).eq('active', true).lte('next_due', today),
        db.from('quarantine_items').select('id', { count: 'exact', head: true }).eq('pharmacy_id', p.id).eq('status', 'awaiting'),
        db.from('destruction_book').select('id', { count: 'exact', head: true }).eq('pharmacy_id', p.id).is('destroyed_date', null),
      ]);
      const regIds = (regs ?? []).map((r) => r.id);
      const [week, late, checks] = regIds.length ? await Promise.all([
        db.from('cd_entries').select('id', { count: 'exact', head: true }).in('register_id', regIds).gte('recorded_at', weekAgo),
        db.from('cd_entries').select('id', { count: 'exact', head: true }).in('register_id', regIds).gte('transaction_date', monthAgo).like('notes', 'Late entry:%'),
        db.from('stock_checks').select('register_id, checked_at, counted, register_balance').eq('pharmacy_id', p.id).order('checked_at', { ascending: false }).limit(500),
      ]) : [{ count: 0 }, { count: 0 }, { data: [] as any[] }];
      // Stock checks: registers not counted within the pharmacy's chosen frequency
      const lastBy = new Map<string, any>();
      for (const c of (checks as any).data ?? []) if (!lastBy.has(c.register_id)) lastBy.set(c.register_id, c);
      const freq = FREQ_DAYS[ph?.stock_check_frequency ?? 'monthly'];
      const overdue = freq ? regIds.filter((id) => { const c = lastBy.get(id); return !c || (Date.now() - new Date(c.checked_at).getTime()) / 864e5 > freq; }).length : 0;
      const discrepancies = Array.from(lastBy.values()).filter((c) => Number(c.counted) !== Number(c.register_balance)).length;
      const lastCheck = Array.from(lastBy.values()).map((c) => c.checked_at).sort().pop() ?? null;
      return {
        id: p.id, name: ph?.name ?? p.name, address: ph?.address ?? null, current: p.id === account.pharmacyId,
        status: ph ? effectiveStatus(ph as any) : null,
        registers: regIds.length, entries_7d: (week as any).count ?? 0, late_30d: (late as any).count ?? 0,
        reminders_due: rem.count ?? 0, awaiting_destruction: (qa.count ?? 0) + (book.count ?? 0),
        stock_checks_overdue: overdue, stock_check_frequency: ph?.stock_check_frequency ?? 'monthly', last_stock_check: lastCheck, discrepancies,
      };
    }));
    await audit(account.pharmacyId, 'group.overview_viewed', staff, account.authUserId, { pharmacies: rows.length });
    return NextResponse.json({ pharmacies: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
