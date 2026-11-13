import { getSettings } from '@/lib/settings';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAccount, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyPin, PIN_PATTERN } from '@/lib/pin';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import { STAFF_COOKIE, encodeStaffSession, cookieOptionsFor } from '@/lib/staff-session';

// Enter sign-in number (staff PIN) → becomes the active staff member.
export async function POST(req: Request) {
  try {
    const account = await requireAccount(); // PIN only works inside a signed-in pharmacy session
    const limit = checkRateLimit(`pin:${account.pharmacyId}:${clientKey(req)}`, 5, 60_000);
    if (!limit.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${limit.retryAfter}s.` }, { status: 429 });
    }

    const { pin } = await req.json().catch(() => ({}));
    if (typeof pin !== 'string' || !PIN_PATTERN.test(pin.trim())) {
      return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 });
    }

    const db = createServiceClient();
    const { data: candidates } = await db
      .from('staff')
      .select('id, full_name, role, psi_number, pin_hash, access_expires_at')
      .eq('pharmacy_id', account.pharmacyId)
      .eq('is_active', true)
      .not('pin_hash', 'is', null);

    let match: any = null;
    for (const row of candidates ?? []) {
      if (await verifyPin(pin, row.pin_hash)) { match = row; break; }
    }

    if (!match) {
      await audit(account.pharmacyId, 'staff.pin_failed', null, account.authUserId);
      return NextResponse.json({ error: 'PIN not recognised: try again', code: 'BAD_PIN' }, { status: 400 }); // not 401: a wrong PIN must not sign the pharmacy out
    }
    if (match.access_expires_at && new Date(match.access_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Your temporary access has expired. Ask the supervising pharmacist.' }, { status: 403 });
    }

    const { lock_minutes } = await getSettings(createServiceClient(), account.pharmacyId);
    const idle = lock_minutes * 60;
    cookies().set(
      STAFF_COOKIE,
      encodeStaffSession({ staffId: match.id, pharmacyId: account.pharmacyId, authUserId: account.authUserId, idle }),
      cookieOptionsFor(idle),
    );
    await audit(account.pharmacyId, 'staff.signed_in', match, account.authUserId, { via: 'pin' });

    return NextResponse.json({ staff: { id: match.id, full_name: match.full_name, role: match.role, psi_number: match.psi_number } });
  } catch (err) {
    return errorResponse(err);
  }
}
