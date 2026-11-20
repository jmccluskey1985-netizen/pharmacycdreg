import { COMPANY } from '@/config/company';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Sign-in emails (password reset, invitations, "password changed"), sent by us through Gmail
 * rather than Supabase's built-in mailer (which only reaches the project's own team).
 *
 * Links carry a one-time token hash to OUR /reset-password page, which redeems it in the
 * browser with verifyOtp. Email security scanners that open links don't use the token up, the
 * token is removed from the address bar straight away, and it expires (Supabase: 1 hour).
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const normEmail = (e: string) => e.toLowerCase().trim().replace(/@googlemail\.com$/, '@gmail.com');

function wrap(body: string, footer: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.5">
<p style="font-weight:700;font-size:20px;margin:0 0 16px"><span style="color:#184B21">Pharmacy</span><span style="color:#54BD50">CDReg</span><span style="color:#184B21">.ie</span></p>
${body}
<p style="color:#64748b;font-size:12px;margin-top:28px">${footer} No patient details are ever included in our emails. Questions: ${COMPANY.email}</p></div>`;
}
const button = (href: string, label: string) => `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;padding:12px 20px;background:#184B21;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">${label}</a></p><p style="font-size:12px;color:#64748b;word-break:break-all">Or copy this link: ${esc(href)}</p>`;

export function resetEmail(link: string) {
  return {
    subject: 'Reset your PharmacyCDReg.ie password',
    html: wrap(`<p>Someone (hopefully you) asked to reset the password for this PharmacyCDReg.ie login.</p>${button(link, 'Choose a new password')}<p style="font-size:14px">The link works <b>once</b> and expires in <b>1 hour</b>. If you didn’t ask for this, ignore this email: your password stays the same. If it keeps happening, tell us at ${COMPANY.email}.</p>`,
      'You’re getting this because a password reset was requested at pharmacycdreg.ie.'),
  };
}

export function inviteEmail(link: string, pharmacy?: string | null) {
  return {
    subject: pharmacy ? `You’re invited to ${pharmacy} on PharmacyCDReg.ie` : 'Your PharmacyCDReg.ie login',
    html: wrap(`<p>${pharmacy ? `You’ve been given a login for <b>${esc(pharmacy)}</b>` : 'A login has been set up for you'} on <b>PharmacyCDReg.ie</b>, the electronic Controlled Drugs Register.</p>${button(link, 'Choose your password')}<p style="font-size:14px">The link works once and expires in 24 hours. If it has expired, use <b>Forgot password</b> on the sign-in page with this email address.</p>`,
      'You’re getting this because someone set up a PharmacyCDReg.ie login for this address.'),
  };
}

export function passwordChangedEmail(when: Date) {
  const t = when.toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Dublin' });
  return {
    subject: 'Your PharmacyCDReg.ie password was changed',
    html: wrap(`<p>The password for this PharmacyCDReg.ie login was changed on <b>${t}</b> (Irish time). Other devices signed in with the old password have been signed out.</p><p style="font-size:14px">If this was you, there’s nothing to do. <b>If it wasn’t</b>, use Forgot password on the sign-in page now and contact us at ${COMPANY.email}.</p>`,
      'A security notice for your PharmacyCDReg.ie login.'),
  };
}

/** One-time link to our reset page. type: 'recovery' (forgot password) or 'invite' (new login). */
export async function authLink(email: string, type: 'recovery' | 'invite', site: string, opts: { welcome?: boolean; data?: Record<string, unknown> } = {}) {
  const db = createServiceClient();
  const gen = await db.auth.admin.generateLink(type === 'invite'
    ? { type: 'invite', email, options: { data: opts.data } }
    : { type: 'recovery', email });
  const hash = gen.data?.properties?.hashed_token;
  if (gen.error || !hash) return { link: null, user: gen.data?.user ?? null, error: gen.error?.message ?? 'no link' };
  const q = new URLSearchParams({ token_hash: hash, type });
  if (opts.welcome) q.set('welcome', '1');
  return { link: `${site}/reset-password?${q}`, user: gen.data.user, error: null };
}
