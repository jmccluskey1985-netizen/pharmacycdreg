import { NextResponse } from 'next/server';
import { requireAccount, requireStaff, errorResponse, HttpError } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Who is at the keyboard? Returns pharmacy + active staff (or locked=true).
export async function GET() {
  try {
    const account = await requireAccount();
    const db = createServiceClient();
    const { data: pharmacy } = await db.from('pharmacies').select('id, name, address, psi_premises_number, subscription_status, trial_ends_at, current_period_end, cancel_at_period_end').eq('id', account.pharmacyId).single();
    const { count } = await db.from('staff').select('id', { count: 'exact', head: true }).eq('pharmacy_id', account.pharmacyId).eq('is_active', true).not('pin_hash', 'is', null);
    try {
      const { staff } = await requireStaff();
      const { count: inbox } = await db.from('pmr_inbox').select('id', { count: 'exact', head: true }).eq('pharmacy_id', account.pharmacyId).eq('status', 'pending');
      return NextResponse.json({ pharmacy, staff, locked: false, hasPins: (count ?? 0) > 0, inboxCount: inbox ?? 0 });
    } catch (e) {
      if (e instanceof HttpError && e.status === 423) {
        return NextResponse.json({ pharmacy, staff: null, locked: true, hasPins: (count ?? 0) > 0 });
      }
      throw e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
