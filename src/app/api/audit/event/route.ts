import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';

const ALLOWED = new Set(['security.two_step_added', 'security.two_step_removed']);

// Client-side security events (two-step sign-in changes happen in the browser via Supabase).
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff();
    const { action } = await req.json().catch(() => ({}));
    if (!ALLOWED.has(action)) return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
    await audit(account.pharmacyId, action, staff, account.authUserId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
