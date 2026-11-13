import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// One vote per pharmacy per shared idea; POST again to take it back.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const { data: f } = await db.from('feedback').select('id').eq('id', params.id).eq('shared', true).maybeSingle();
    if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: had } = await db.from('feedback_votes').select('feedback_id').eq('feedback_id', f.id).eq('pharmacy_id', account.pharmacyId).maybeSingle();
    if (had) await db.from('feedback_votes').delete().eq('feedback_id', f.id).eq('pharmacy_id', account.pharmacyId);
    else await db.from('feedback_votes').insert({ feedback_id: f.id, pharmacy_id: account.pharmacyId });
    return NextResponse.json({ voted: !had });
  } catch (err) {
    return errorResponse(err);
  }
}
