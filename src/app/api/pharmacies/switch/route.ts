import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { requireAccount, pharmaciesFor, errorResponse, audit, PHARMACY_COOKIE } from '@/lib/access';
import { STAFF_COOKIE } from '@/lib/staff-session';

export const dynamic = 'force-dynamic';

/**
 * Superintendent: switch to another pharmacy this login may open. The screen locks, and the
 * person signs in with their PIN for that pharmacy, so every entry is still signed there.
 */
export async function POST(req: Request) {
  try {
    const account = await requireAccount();
    const parsed = z.object({ pharmacy_id: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Choose a pharmacy' }, { status: 400 });
    const list = await pharmaciesFor(account.authUserId, account.homePharmacyId ?? account.pharmacyId);
    const to = list.find((p) => p.id === parsed.data.pharmacy_id);
    if (!to) return NextResponse.json({ error: 'This login can’t open that pharmacy' }, { status: 403 });
    const jar = await cookies();
    jar.set(PHARMACY_COOKIE, to.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
    jar.delete(STAFF_COOKIE);
    await audit(to.id, 'login.switched_in', null, account.authUserId, { from_pharmacy: account.pharmacyId === to.id ? null : account.pharmacyId });
    return NextResponse.json({ ok: true, pharmacy: to });
  } catch (err) {
    return errorResponse(err);
  }
}
