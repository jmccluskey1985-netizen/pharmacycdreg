/**
 * Site owner (you, not every pharmacy): emails listed in the ADMIN_EMAILS environment
 * variable (comma-separated, set in Vercel — never in the code). Can see the waitlist.
 */
export function isSiteAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const norm = email.trim().toLowerCase().replace(/@googlemail\.com$/, '@gmail.com');
  return list.some((e) => e.replace(/@googlemail\.com$/, '@gmail.com') === norm);
}
