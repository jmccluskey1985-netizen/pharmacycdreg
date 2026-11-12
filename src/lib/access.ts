import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server';
import { STAFF_COOKIE, decodeStaffSession, encodeStaffSession, cookieOptionsFor } from '@/lib/staff-session';
import type { StaffRole } from '@/lib/roles';
import { canWrite } from '@/lib/stripe';
import { isSiteAdmin } from '@/lib/admin';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export interface Account {
  authUserId: string;
  email: string;
  pharmacyId: string;
}

export interface Staff {
  id: string;
  full_name: string;
  role: StaffRole;
  psi_number: string | null;
  pharmacy_id: string;
}

/** Step 1: the pharmacy login (email + password via Supabase). */
export async function requireAccount(): Promise<Account> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, 'Not signed in', 'NO_ACCOUNT');
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') throw new HttpError(401, 'Enter the code from your authenticator app', 'NEEDS_CODE');
  const db = createServiceClient();
  const { data } = await db.from('pharmacy_accounts').select('pharmacy_id').eq('auth_user_id', user.id).maybeSingle();
  if (!data) throw new HttpError(403, 'This login is not linked to a pharmacy', 'NO_PHARMACY');
  return { authUserId: user.id, email: user.email ?? '', pharmacyId: data.pharmacy_id };
}

/** Step 2: the staff member identified by PIN. Re-checked on every request. */
/**
 * opts.write: the action adds to the register (entries, new registers, scans).
 * Needs an active trial/subscription. Reading, search, print and export never do —
 * the register must stay available for inspection whatever the billing state.
 */
export async function requireStaff(allowed?: (r: StaffRole) => boolean, opts: { write?: boolean } = {}): Promise<{ account: Account; staff: Staff }> {
  const account = await requireAccount();
  const session = decodeStaffSession(cookies().get(STAFF_COOKIE)?.value);
  if (!session || session.pharmacyId !== account.pharmacyId || session.authUserId !== account.authUserId) {
    throw new HttpError(423, 'Enter your PIN to continue', 'LOCKED');
  }
  const db = createServiceClient();
  const { data: staff } = await db
    .from('staff')
    .select('id, full_name, role, psi_number, pharmacy_id, is_active, access_expires_at')
    .eq('id', session.staffId)
    .maybeSingle();
  if (!staff || !staff.is_active || staff.pharmacy_id !== account.pharmacyId) {
    throw new HttpError(423, 'Enter your PIN to continue', 'LOCKED');
  }
  if (staff.access_expires_at && new Date(staff.access_expires_at) < new Date()) {
    throw new HttpError(423, 'Your temporary access has expired', 'LOCKED');
  }
  if (allowed && !allowed(staff.role)) {
    throw new HttpError(403, 'Your role does not allow this action', 'FORBIDDEN');
  }
  if (opts.write) {
    const { data: ph } = await db.from('pharmacies').select('subscription_status').eq('id', account.pharmacyId).single();
    if (!canWrite(ph?.subscription_status) && !isSiteAdmin(account.email)) {
      throw new HttpError(402, ph?.subscription_status ? 'Your subscription has ended. The register is read-only until it is reactivated.' : 'Start your free month to begin recording entries.', 'READ_ONLY');
    }
  }
  // Sliding idle timeout: any authenticated activity extends the lock timer.
  try {
    const { exp: _exp, ...keep } = session;
    cookies().set(STAFF_COOKIE, encodeStaffSession(keep), cookieOptionsFor(session.idle));
  } catch {
    /* read-only context */
  }
  return { account, staff: staff as Staff };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}

export async function audit(pharmacyId: string, action: string, staff: Pick<Staff, 'id' | 'full_name'> | null, authUserId: string | null, details: Record<string, unknown> = {}, target?: { table: string; id: string }) {
  const db = createServiceClient();
  await db.from('audit_log').insert({
    pharmacy_id: pharmacyId,
    action,
    staff_id: staff?.id ?? null,
    staff_name: staff?.full_name ?? null,
    auth_user_id: authUserId,
    target_table: target?.table ?? null,
    target_id: target?.id ?? null,
    details,
  });
}
