import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Training mode: a read-only copy of this pharmacy's registers for the browser to practise on.
 * Nothing done in training comes back here — the copy lives in the page and is gone on refresh.
 * PIN hashes are never included.
 */
export async function GET() {
  try {
    const { account, staff } = await requireStaff();
    const db = createServiceClient();
    const [staffRows, regs, contacts] = await Promise.all([
      db.from('staff').select('id, full_name, role, psi_number, is_active, access_expires_at, created_at').eq('pharmacy_id', account.pharmacyId),
      db.from('cd_registers').select('*').eq('pharmacy_id', account.pharmacyId),
      db.from('contacts').select('*').eq('pharmacy_id', account.pharmacyId).eq('is_active', true),
    ]);
    const registers = regs.data ?? [];
    const regIds = registers.map((r: any) => r.id);
    const productIds = [...new Set(registers.map((r: any) => r.product_id))];
    const [products, entries, patients, inbox] = await Promise.all([
      productIds.length ? db.from('cd_products').select('*').in('id', productIds) : Promise.resolve({ data: [] as any[] }),
      regIds.length ? db.from('cd_entries').select('*').in('register_id', regIds).order('seq').limit(50000) : Promise.resolve({ data: [] as any[] }),
      db.from('patients').select('*').eq('pharmacy_id', account.pharmacyId).eq('is_active', true).limit(5000),
      db.from('pmr_inbox').select('*').eq('pharmacy_id', account.pharmacyId).eq('status', 'pending').limit(200),
    ]);
    const settings = await getSettings(db, account.pharmacyId);
    await audit(account.pharmacyId, 'training.started', staff, account.authUserId);
    return NextResponse.json({
      activeStaffId: staff.id,
      staff: (staffRows.data ?? []).map((s: any) => ({ ...s, pin: null })),
      products: products.data ?? [],
      registers: registers.map((r: any) => ({ id: r.id, product_id: r.product_id, opened_at: r.opened_at, closed_at: r.closed_at })),
      entries: (entries.data ?? []).map((e: any) => ({ ...e, quantity: String(e.quantity) })),
      contacts: contacts.data ?? [],
      patients: (patients as any).error ? undefined : (patients as any).data ?? [],
      inbox: (inbox as any).error ? [] : (inbox as any).data ?? [],
      settings: { ...settings },
      lowStock: Object.fromEntries(registers.filter((r: any) => r.low_stock_level != null).map((r: any) => [r.id, r.low_stock_level])),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
