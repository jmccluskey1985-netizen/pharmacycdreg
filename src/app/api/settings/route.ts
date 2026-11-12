import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';
import { can } from '@/lib/roles';
import { balancesFor } from '@/lib/registers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { account } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const settings = await getSettings(db, account.pharmacyId);
    const { data: regs } = await db.from('cd_registers').select('*, product:cd_products(drug_name, strength, form, unit)').eq('pharmacy_id', account.pharmacyId).is('closed_at', null);
    const bal = await balancesFor((regs ?? []).map((r: any) => r.id));
    const registers = (regs ?? []).map((r: any) => ({ id: r.id, label: `${r.product.drug_name} ${r.product.strength} ${r.product.form}`, unit: r.product.unit, balance: bal[r.id] ?? 0, low_stock_level: r.low_stock_level ?? null }));
    return NextResponse.json({ settings, registers });
  } catch (err) {
    return errorResponse(err);
  }
}

const Patch = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  address: z.string().trim().min(5).max(300).optional(),
  psi_premises_number: z.string().trim().max(20).nullable().optional(),
  invoice_names: z.string().trim().max(300).nullable().optional(),
  lock_minutes: z.coerce.number().int().min(2).max(120).optional(),
  locum_default_days: z.coerce.number().int().min(1).max(365).optional(),
  stock_check_frequency: z.enum(['off', 'weekly', 'fortnightly', 'monthly']).optional(),
  low_stock: z.array(z.object({ register_id: z.string().uuid(), level: z.coerce.number().min(0).nullable() })).max(500).optional(),
});

export async function PATCH(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.manageStaff);
    const parsed = Patch.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the settings', issues: parsed.error.flatten() }, { status: 400 });
    const { low_stock, ...fields } = parsed.data;
    const db = createServiceClient();
    if (Object.keys(fields).length) {
      const { error } = await db.from('pharmacies').update(fields).eq('id', account.pharmacyId);
      if (error) {
        if (/column/i.test(error.message)) return NextResponse.json({ error: 'Settings need a one-off database update first (run migration 0007 in Supabase).' }, { status: 409 });
        throw error;
      }
    }
    for (const l of low_stock ?? []) {
      const { error } = await db.from('cd_registers').update({ low_stock_level: l.level }).eq('id', l.register_id).eq('pharmacy_id', account.pharmacyId);
      if (error && /column/i.test(error.message)) return NextResponse.json({ error: 'Settings need a one-off database update first (run migration 0007 in Supabase).' }, { status: 409 });
    }
    await audit(account.pharmacyId, 'settings.updated', staff, account.authUserId, { ...fields, low_stock_count: low_stock?.length ?? 0 });
    return NextResponse.json({ settings: await getSettings(db, account.pharmacyId) });
  } catch (err) {
    return errorResponse(err);
  }
}
