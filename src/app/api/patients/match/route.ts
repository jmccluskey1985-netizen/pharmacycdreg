import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { findPatientMatches, candidateView } from '@/lib/patients';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const opt = z.string().trim().max(300).optional().nullable();
const Probe = z.object({
  full_name: opt, first_name: opt, surname: opt,
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().catch(null),
  address: opt, eircode: opt, gms: opt, dps: opt, lti: opt, mrn: opt,
});

/** Existing patients who look like the person on the script, best first (docs/PATIENT_MATCHING.md). */
export async function POST(req: Request) {
  try {
    const { account } = await requireStaff('scan');
    const parsed = Probe.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    const db = createServiceClient();
    const { candidates, pick, ambiguous } = await findPatientMatches(db, account.pharmacyId, parsed.data);
    return NextResponse.json({ candidates: candidates.map(candidateView), pick_id: pick?.patient.id ?? null, ambiguous });
  } catch (err) {
    return errorResponse(err);
  }
}
