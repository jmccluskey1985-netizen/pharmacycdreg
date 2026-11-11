import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, requireAccount, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPin, verifyPin, PIN_PATTERN } from '@/lib/pin';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { account } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const { data } = await db
      .from('staff')
      .select('id, full_name, role, psi_number, is_active, access_expires_at, created_at, pin_hash')
      .eq('pharmacy_id', account.pharmacyId)
      .order('created_at');
    // Never send PIN hashes to the browser.
    return NextResponse.json({ staff: (data ?? []).map(({ pin_hash, ...s }) => ({ ...s, has_pin: !!pin_hash })) });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(['supervising_pharmacist', 'pharmacist', 'locum_pharmacist', 'technician', 'read_only']),
  psi_number: z.string().trim().max(20).optional().nullable(),
  pin: z.string().regex(PIN_PATTERN).optional(),
  access_expires_at: z.string().datetime().optional().nullable(),
  is_active: z.boolean().optional(),
});

async function pinTaken(pharmacyId: string, pin: string, exceptId?: string) {
  const db = createServiceClient();
  const { data } = await db.from('staff').select('id, pin_hash').eq('pharmacy_id', pharmacyId).eq('is_active', true).not('pin_hash', 'is', null);
  for (const row of data ?? []) {
    if (row.id !== exceptId && (await verifyPin(pin, row.pin_hash))) return true;
  }
  return false;
}

// Create or update a staff member. The very first staff member (bootstrap) can be
// created by the signed-in account before any PIN exists; after that only the
// supervising pharmacist can manage the team.
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the staff details', issues: parsed.error.flatten() }, { status: 400 });
    const b = parsed.data;

    const account = await requireAccount();
    const db = createServiceClient();
    const { count } = await db.from('staff').select('id', { count: 'exact', head: true }).eq('pharmacy_id', account.pharmacyId);
    const bootstrap = (count ?? 0) === 0;
    let actor: any = null;
    if (bootstrap) {
      if (b.role !== 'supervising_pharmacist' || !b.pin) {
        return NextResponse.json({ error: 'First set up the supervising pharmacist with a PIN' }, { status: 400 });
      }
    } else {
      actor = (await requireStaff(can.manageStaff)).staff;
    }

    if (b.pin && (await pinTaken(account.pharmacyId, b.pin, b.id))) {
      return NextResponse.json({ error: 'That PIN is already used by someone in this pharmacy' }, { status: 409 });
    }

    const row: Record<string, unknown> = {
      full_name: b.full_name,
      role: b.role,
      psi_number: b.psi_number || null,
      access_expires_at: b.access_expires_at ?? null,
    };
    if (b.pin) row.pin_hash = await hashPin(b.pin);
    if (b.is_active !== undefined) row.is_active = b.is_active;

    let id = b.id;
    if (id) {
      const { error } = await db.from('staff').update(row).eq('id', id).eq('pharmacy_id', account.pharmacyId);
      if (error) throw error;
    } else {
      const { data, error } = await db.from('staff').insert({ ...row, pharmacy_id: account.pharmacyId }).select('id').single();
      if (error) throw error;
      id = data.id;
    }
    const { pin, ...logged } = b;
    await audit(account.pharmacyId, b.id ? 'staff.updated' : 'staff.created', actor, account.authUserId, { ...logged, pin_changed: !!pin }, { table: 'staff', id: id! });
    return NextResponse.json({ id });
  } catch (err) {
    return errorResponse(err);
  }
}
