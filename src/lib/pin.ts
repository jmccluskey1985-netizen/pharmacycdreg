/**
 * Staff PIN hashing: same approach as PharmacyConsultation.ie: PINs are bcrypt
 * hashed on write and verified on read. Because hashes are salted you can't look a
 * member up by PIN, so callers fetch the pharmacy's active staff and verify each.
 * The 5-per-minute rate limit on /api/staff/unlock is the real brute-force defence.
 */
import bcrypt from 'bcryptjs';

export const PIN_PATTERN = /^\d{4,6}$/;

export function hashPin(pin: string) {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string | null | undefined) {
  if (!hash) return false;
  return bcrypt.compare(String(pin).trim(), hash);
}
