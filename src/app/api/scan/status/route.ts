import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getReaderConfig } from '@/lib/reader-config';

export const dynamic = 'force-dynamic';

// Is a document reader set up for this pharmacy? (Never reveals the key.)
export async function GET() {
  try {
    const { account } = await requireStaff();
    const cfg = await getReaderConfig(createServiceClient(), account.pharmacyId);
    const configured = !!cfg || !!process.env.ANTHROPIC_API_KEY;
    return NextResponse.json({ configured, source: cfg?.source ?? (process.env.ANTHROPIC_API_KEY ? 'anthropic' : null), missing: configured ? null : 'Settings → Document reading' });
  } catch (err) {
    return errorResponse(err);
  }
}
