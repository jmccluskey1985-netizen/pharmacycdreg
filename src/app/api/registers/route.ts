import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { balancesFor, ledgerSummary } from '@/lib/registers';
import { can } from '@/lib/roles';
import { getSettings, FREQ_DAYS } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// The "bookshelf": every live register for this premises with its balance (FR1, FR4, FR8, FR15).
export async function GET() {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const { data } = await db
      .from('cd_registers')
      .select('*, product:cd_products(*, parent:is_stereoisomer_of(drug_name))')
      .eq('pharmacy_id', account.pharmacyId)
      .is('closed_at', null);
    const regs = (data ?? []) as any[];
    const summary = await ledgerSummary(regs.map((r) => r.id));
    const balances = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.balance]));
    regs.sort((a, b) => a.product.schedule - b.product.schedule || (a.product.schedule_paragraph ?? '').localeCompare(b.product.schedule_paragraph ?? '') || a.product.class_name.localeCompare(b.product.class_name) || Number(!!a.product.is_stereoisomer_of) - Number(!!b.product.is_stereoisomer_of) || a.product.strength.localeCompare(b.product.strength));
    // Stock-check due + low stock (Settings). Quietly skipped until migration 0007 is run.
    const settings = await getSettings(db, account.pharmacyId);
    const lastCheck: Record<string, string> = {};
    if (regs.length) {
      const { data: checks } = await db.from('stock_checks').select('register_id, checked_at').eq('pharmacy_id', account.pharmacyId).order('checked_at', { ascending: false }).limit(2000);
      for (const c of checks ?? []) if (!lastCheck[c.register_id]) lastCheck[c.register_id] = c.checked_at;
    }
    const days = FREQ_DAYS[settings.stock_check_frequency];
    const due = (r: any) => {
      if (!days || !settings.migrated) return false;
      const since = lastCheck[r.id] ?? r.opened_at;
      return Date.now() - new Date(since).getTime() > days * 864e5;
    };
    return NextResponse.json({
      registers: regs.map((r) => {
        const balance = balances[r.id] ?? 0;
        const { low_stock_level, ...rest } = r;
        return { ...rest, balance, entry_count: summary[r.id]?.entries ?? 0, low_stock_level: low_stock_level ?? null, low_stock: low_stock_level != null && balance <= Number(low_stock_level), last_checked_at: lastCheck[r.id] ?? null, check_due: due(r) };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  drug_name: z.string().trim().min(2),
  brand: z.string().trim().max(80).optional().nullable(),
  class_name: z.string().trim().min(2),
  schedule: z.coerce.number().int().min(2).max(4),
  schedule_paragraph: z.string().trim().optional().nullable(),
  form: z.string().trim().min(2),
  strength: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  opening_balance: z.coerce.number().min(0).optional(),
  opening_balance_note: z.string().trim().optional(),
  opening_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  // FR7: a stereoisomer preparation is recorded in the parent drug's part of the register.
  stereoisomer_of_register_id: z.string().uuid().optional().nullable(),
});

// Open a new register (one live register per product per premises — FR13 is enforced by a unique index).
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.openRegister, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the product details', issues: parsed.error.flatten() }, { status: 400 });
    const b = parsed.data;
    const db = createServiceClient();

    let parentProductId: string | null = null;
    if (b.stereoisomer_of_register_id) {
      const { data: parent } = await db
        .from('cd_registers')
        .select('product:cd_products(id, class_name, schedule, schedule_paragraph)')
        .eq('id', b.stereoisomer_of_register_id)
        .eq('pharmacy_id', account.pharmacyId)
        .maybeSingle();
      const pp = (parent as any)?.product;
      if (!pp) return NextResponse.json({ error: 'Parent register not found' }, { status: 404 });
      parentProductId = pp.id;
      b.class_name = pp.class_name; // same part of the register as the parent
      b.schedule = pp.schedule;
      b.schedule_paragraph = b.schedule_paragraph || pp.schedule_paragraph;
    }

    // Reuse an identical product definition if one exists (shared catalogue) — same brand too.
    const brand = b.brand?.trim() || null;
    const { data: candidates } = await db.from('cd_products').select('*').ilike('drug_name', b.drug_name).ilike('form', b.form).ilike('strength', b.strength).limit(20);
    const hasBrandColumn = (candidates ?? []).some((c: any) => 'brand' in c);
    let product: { id: string } | null = (candidates ?? []).find((c: any) =>
      !hasBrandColumn || (brand ? (c.brand ?? '').toLowerCase() === brand.toLowerCase() : !c.brand)) ?? null;
    if (!product) {
      const row: Record<string, unknown> = { drug_name: b.drug_name, class_name: b.class_name, schedule: b.schedule, schedule_paragraph: b.schedule_paragraph || null, is_stereoisomer_of: parentProductId, form: b.form, strength: b.strength, unit: b.unit };
      let ins = await db.from('cd_products').insert(brand ? { ...row, brand } : row).select('id').single();
      if (ins.error && brand && /brand/i.test(ins.error.message)) ins = await db.from('cd_products').insert(row).select('id').single(); // before migration 0010
      if (ins.error) throw ins.error;
      product = ins.data;
    }

    const reg = await db
      .from('cd_registers')
      .insert({ pharmacy_id: account.pharmacyId, product_id: product!.id, opened_by_staff_id: staff.id })
      .select('id')
      .single();
    if (reg.error) {
      if (reg.error.code === '23505') return NextResponse.json({ error: 'A live register for this product already exists' }, { status: 409 });
      throw reg.error;
    }

    // Balance brought forward from the paper book is recorded as an opening receipt line.
    if (b.opening_balance && b.opening_balance > 0) {
      const op = await db.from('cd_entries').insert({
        register_id: reg.data.id,
        entry_type: 'receipt',
        transaction_date: b.opening_date && b.opening_date <= new Date().toISOString().slice(0, 10) ? b.opening_date : new Date().toISOString().slice(0, 10),
        quantity: b.opening_balance,
        supplier_name: 'Balance brought forward',
        supplier_address: b.opening_balance_note || 'Transferred from previous register',
        notes: 'Opening balance',
        recorded_by_staff_id: staff.id,
        recorded_by_auth_user: account.authUserId,
      });
      if (op.error) throw op.error;
    }

    await audit(account.pharmacyId, 'register.opened', staff, account.authUserId, b, { table: 'cd_registers', id: reg.data.id });
    return NextResponse.json({ id: reg.data.id });
  } catch (err) {
    return errorResponse(err);
  }
}
