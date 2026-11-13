import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Everything this pharmacy has, as one JSON file: for the pharmacy's own off-site copy
 * (business continuity) and for data portability. Supervising pharmacist only; audited.
 * Secrets (PIN hashes, Stripe ids, API keys) are left out. Photos on notes are listed, not embedded.
 */
export async function GET() {
  try {
    const { account, staff } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const ph = account.pharmacyId;
    const all = async (table: string, filter: (q: any) => any, order = 'id') => {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await filter(db.from(table).select('*')).order(order).range(from, from + 999);
        if (error) return out.length ? out : { unavailable: error.message.slice(0, 120) };
        out.push(...(data ?? []));
        if (!data || data.length < 1000) return out;
      }
    };
    const { data: pharmacy } = await db.from('pharmacies').select('*').eq('id', ph).single();
    const p: any = { ...pharmacy };
    for (const k of ['stripe_customer_id', 'subscription_id', 'halo_api_key_hash']) delete p[k];
    const registers = await all('cd_registers', (q) => q.eq('pharmacy_id', ph));
    const regIds = Array.isArray(registers) ? registers.map((r: any) => r.id) : [];
    const productIds = Array.isArray(registers) ? Array.from(new Set(registers.map((r: any) => r.product_id))) : [];
    const staffRows = await all('staff', (q) => q.eq('pharmacy_id', ph));
    const backup = {
      format: 'pharmacycdreg-backup',
      version: 1,
      exported_at: new Date().toISOString(),
      exported_by: staff.full_name,
      pharmacy: p,
      staff: Array.isArray(staffRows) ? staffRows.map(({ pin_hash, ...s }: any) => s) : staffRows,
      products: productIds.length ? await all('cd_products', (q) => q.in('id', productIds)) : [],
      registers,
      entries: regIds.length ? await all('cd_entries', (q) => q.in('register_id', regIds), 'seq') : [],
      stock_checks: await all('stock_checks', (q) => q.eq('pharmacy_id', ph)),
      quarantine_items: await all('quarantine_items', (q) => q.eq('pharmacy_id', ph)),
      destruction_book: await all('destruction_book', (q) => q.eq('pharmacy_id', ph)),
      patients: await all('patients', (q) => q.eq('pharmacy_id', ph)),
      contacts: await all('contacts', (q) => q.eq('pharmacy_id', ph)),
      dispense_reminders: await all('dispense_reminders', (q) => q.eq('pharmacy_id', ph)),
      notes: await all('notes', (q) => q.eq('pharmacy_id', ph)),
      note_attachments: await all('note_attachments', (q) => q.eq('pharmacy_id', ph)),
      audit_log: await all('audit_log', (q) => q.eq('pharmacy_id', ph)),
    };
    await audit(ph, 'data.backup_downloaded', staff, account.authUserId, { entries: Array.isArray(backup.entries) ? backup.entries.length : 0 });
    const name = `pharmacycdreg-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(backup, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
