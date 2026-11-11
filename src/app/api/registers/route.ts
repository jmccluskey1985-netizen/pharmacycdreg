import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { balancesFor } from '@/lib/registers';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// The "bookshelf": every live register for this premises with its balance (FR1, FR4, FR8, FR15).
export async function GET() {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const { data } = await db
      .from('cd_registers')
      .select('id, opened_at, closed_at, product:cd_products(id, drug_name, schedule, schedule_paragraph, class_name, form, strength, unit)')
      .eq('pharmacy_id', account.pharmacyId)
      .is('closed_at', null);
    const regs = (data ?? []) as any[];
    const balances = await balancesFor(regs.map((r) => r.id));
    regs.sort((a, b) => a.product.schedule - b.product.schedule || a.product.class_name.localeCompare(b.product.class_name) || a.product.strength.localeCompare(b.product.strength));
    return NextResponse.json({ registers: regs.map((r) => ({ ...r, balance: balances[r.id] ?? 0 })) });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  drug_name: z.string().trim().min(2),
  class_name: z.string().trim().min(2),
  schedule: z.coerce.number().int().min(2).max(4),
  schedule_paragraph: z.string().trim().optional().nullable(),
  form: z.string().trim().min(2),
  strength: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  opening_balance: z.coerce.number().min(0).optional(),
  opening_balance_note: z.string().trim().optional(),
});

// Open a new register (one live register per product per premises — FR13 is enforced by a unique index).
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.openRegister, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the product details', issues: parsed.error.flatten() }, { status: 400 });
    const b = parsed.data;
    const db = createServiceClient();

    // Reuse an identical product definition if one exists (shared catalogue).
    let { data: product } = await db
      .from('cd_products')
      .select('id')
      .ilike('drug_name', b.drug_name)
      .ilike('form', b.form)
      .ilike('strength', b.strength)
      .maybeSingle();
    if (!product) {
      const ins = await db
        .from('cd_products')
        .insert({ drug_name: b.drug_name, class_name: b.class_name, schedule: b.schedule, schedule_paragraph: b.schedule_paragraph || null, form: b.form, strength: b.strength, unit: b.unit })
        .select('id')
        .single();
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
        transaction_date: new Date().toISOString().slice(0, 10),
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
