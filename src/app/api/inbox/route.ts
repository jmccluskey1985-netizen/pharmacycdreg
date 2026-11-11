import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { liveRegisters, matchRegister } from '@/lib/match';
import { balancesFor } from '@/lib/registers';

export const dynamic = 'force-dynamic';

// "To confirm": dispensings sent by Halo that need a pharmacist's sign-off.
export async function GET() {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const { data } = await db.from('pmr_inbox').select('*').eq('pharmacy_id', account.pharmacyId).eq('status', 'pending').order('received_at', { ascending: true }).limit(200);
    const regs = await liveRegisters(account.pharmacyId);
    const balances = await balancesFor(regs.map((r) => r.id));
    const items = (data ?? []).map((row: any) => {
      const p = row.payload;
      const { match, candidates } = matchRegister(regs, p.drug.name, p.drug.strength, p.drug.form);
      const registerId = row.register_id ?? match?.id ?? null;
      return {
        id: row.id,
        action: row.action,
        problem: row.problem,
        received_at: row.received_at,
        payload: p,
        register_id: registerId,
        balance: registerId ? balances[registerId] ?? 0 : null,
        candidates: (candidates.length ? candidates : regs).map((r) => ({ id: r.id, label: r.label, unit: r.unit })),
      };
    });
    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
