import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { writePatient } from '@/lib/patients';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';
const t = (n: number) => z.string().trim().max(n).nullable().optional();
const Body = z.object({
  patients: z.array(z.object({
    patient_id: z.string().uuid().nullable().optional(),
    first_name: z.string().trim().min(1).max(80), surname: z.string().trim().max(80).default(''),
    address: t(300), treatment_card_no: t(20), pmr_code: t(20), register_id: z.string().uuid().nullable().optional(),
    daily_dose: z.coerce.number().positive().max(10000).nullable().optional().catch(null), schedule: t(200),
  })).min(1).max(200),
});

/** Add or update the pharmacy's OST patients (from reviewed bag labels). Existing details aren't overwritten with blanks. */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record, { write: true });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the patients' }, { status: 400 });
    const db = createServiceClient();
    let added = 0, updated = 0;
    for (const p of parsed.data.patients) {
      const ost: Record<string, unknown> = { is_ost: true, updated_at: new Date().toISOString() };
      if (p.treatment_card_no) ost.treatment_card_no = p.treatment_card_no;
      if (p.pmr_code) ost.pmr_code = p.pmr_code;
      if (p.register_id) ost.ost_register_id = p.register_id;
      if (p.daily_dose) ost.ost_daily_dose = p.daily_dose;
      if (p.schedule) ost.ost_schedule = p.schedule;
      if (p.patient_id) {
        const { data: own } = await db.from('patients').select('id, surname, address').eq('id', p.patient_id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
        if (!own) continue;
        const { error } = await writePatient(db, { ...ost, surname: own.surname, ...(own.address ? {} : p.address ? { address: p.address } : {}) }, own.id);
        if (error) return NextResponse.json({ error: /column/.test(error.message) ? 'Run migration 0023 in Supabase first.' : error.message }, { status: 409 });
        updated++;
      } else {
        const { error } = await writePatient(db, { pharmacy_id: account.pharmacyId, first_name: p.first_name, surname: p.surname, address: p.address ?? null, ...ost });
        if (error) return NextResponse.json({ error: /column/.test(error.message) ? 'Run migration 0023 in Supabase first.' : error.message }, { status: 409 });
        added++;
      }
    }
    await audit(account.pharmacyId, 'patients.ost_imported', staff, account.authUserId, { added, updated });
    return NextResponse.json({ added, updated });
  } catch (err) {
    return errorResponse(err);
  }
}
