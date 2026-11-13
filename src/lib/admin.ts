/**
 * Site owner (you, not every pharmacy): emails listed in the ADMIN_EMAILS environment
 * variable (comma-separated, set in Vercel, never in the code). Can see the waitlist.
 */
export function isSiteAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const norm = email.trim().toLowerCase().replace(/@googlemail\.com$/, '@gmail.com');
  return list.some((e) => e.replace(/@googlemail\.com$/, '@gmail.com') === norm);
}

/** Where feedback and ideas are emailed: ADMIN_NOTIFY_EMAIL, else the first site owner. */
export function feedbackRecipient(): string {
  const first = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).find(Boolean);
  return process.env.ADMIN_NOTIFY_EMAIL || first || process.env.EMAIL_FROM || '';
}
