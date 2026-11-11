import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getRegisterForPharmacy } from '@/lib/registers';

export const dynamic = 'force-dynamic';

// One register "book": the effective ledger + every raw row (originals and corrections)
// so the page can show struck-through originals with footnotes (FR11, NFR5).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { account, staff } = await requireStaff();
    const reg = await getRegisterForPharmacy(params.id, account.pharmacyId);
    if (!reg) return NextResponse.json({ error: 'Register not found' }, { status: 404 });
    const db = createServiceClient();
    const [ledger, raw, staffRows] = await Promise.all([
      db.from('cd_ledger').select('*').eq('register_id', reg.id).order('seq'),
      db.from('cd_entries').select('*').eq('register_id', reg.id).order('seq'),
      db.from('staff').select('id, full_name, psi_number, role').eq('pharmacy_id', account.pharmacyId),
    ]);
    await audit(account.pharmacyId, 'register.viewed', staff, account.authUserId, {}, { table: 'cd_registers', id: reg.id });
    return NextResponse.json({ register: reg, ledger: ledger.data ?? [], entries: raw.data ?? [], staff: staffRows.data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
