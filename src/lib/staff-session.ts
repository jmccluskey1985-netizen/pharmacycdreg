/**
 * Active-staff session — the "sign-in number" layer.
 *
 * PharmacyConsultation.ie remembers the active staff member in localStorage. For a
 * CD register that isn't good enough: the server must KNOW who made each entry
 * (FR5, NFR2, NFR5). So a successful PIN sets an httpOnly, HMAC-signed cookie that
 * binds staff id + pharmacy + the Supabase account it was unlocked under, with an
 * idle expiry. API routes re-verify it on every write.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export const STAFF_COOKIE = 'cdr_staff';
export const STAFF_IDLE_SECONDS = 15 * 60; // auto-lock after 15 min idle (shared dispensary devices)

export interface StaffSession {
  staffId: string;
  pharmacyId: string;
  authUserId: string;
  exp: number; // unix seconds
  idle?: number; // this pharmacy's auto-lock, seconds (Settings → Security)
}

function secret() {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('STAFF_SESSION_SECRET must be set (32+ chars)');
  return s;
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeStaffSession(s: Omit<StaffSession, 'exp'>): string {
  const idle = s.idle && s.idle >= 120 && s.idle <= 7200 ? s.idle : STAFF_IDLE_SECONDS;
  const body: StaffSession = { ...s, idle, exp: Math.floor(Date.now() / 1000) + idle };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeStaffSession(token: string | undefined | null): StaffSession | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as StaffSession;
    if (s.exp < Math.floor(Date.now() / 1000)) return null;
    return s;
  } catch {
    return null;
  }
}

export const cookieOptionsFor = (idle?: number) => ({ ...staffCookieOptions, maxAge: idle && idle >= 120 && idle <= 7200 ? idle : STAFF_IDLE_SECONDS });

export const staffCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: STAFF_IDLE_SECONDS,
};
