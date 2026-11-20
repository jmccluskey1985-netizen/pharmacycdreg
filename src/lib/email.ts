/**
 * Email via Gmail API + Google service account with domain-wide delegation -
 * the same setup PharmacyConsultation.ie uses. If it isn't configured the email
 * is skipped (logged), never fatal: billing and the register must not depend on it.
 */
import { gmail } from '@googleapis/gmail';
import { JWT } from 'google-auth-library';
import { COMPANY } from '@/config/company';

const enc = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf-8').toString('base64')}?=`);

export const adminEmail = () => process.env.ADMIN_NOTIFY_EMAIL || process.env.EMAIL_FROM || '';

/**
 * Senders: welcome and invitation emails come from welcome@ (COMPANY.welcomeEmail); everything
 * else from support@ (COMPANY.email). Both are Gmail "Send mail as" aliases of EMAIL_MAILBOX, the
 * real Workspace user the service account acts as (support@pharmacyconsultation.ie). EMAIL_FROM
 * switches email on, and is the mailbox when EMAIL_MAILBOX isn't set.
 * replyTo defaults to the support address, so customer replies land in the support inbox. */
export async function sendEmail({ to, subject, html, replyTo, sender = 'support' }: { to: string; subject: string; html: string; replyTo?: string | null; sender?: 'welcome' | 'support' }) {
  const configured = process.env.EMAIL_FROM;
  const from = sender === 'welcome' ? COMPANY.welcomeEmail : COMPANY.email;
  const mailbox = process.env.EMAIL_MAILBOX || configured;
  const fromName = process.env.EMAIL_FROM_NAME || 'PharmacyCDReg.ie';
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!to || !configured || !mailbox || !key || !clientEmail) {
    console.warn('[email] not configured: skipped:', subject);
    return { sent: false };
  }
  try {
    const auth = new JWT({ email: clientEmail, key, scopes: ['https://www.googleapis.com/auth/gmail.send'], subject: mailbox });
    const raw = [
      `From: "${enc(fromName)}" <${from}>`,
      `To: ${to}`,
      ...((replyTo === undefined ? COMPANY.email : replyTo) ? [`Reply-To: ${replyTo === undefined ? COMPANY.email : replyTo}`] : []),
      `Subject: ${enc(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      html,
    ].join('\r\n');
    await gmail({ version: 'v1', auth }).users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } });
    return { sent: true };
  } catch (e) {
    console.error('[email] send failed:', subject, e);
    return { sent: false, error: explainEmailError(e) };
  }
}

/** What's set up for email (addresses only, never the key). For the site owner's Settings → Email. */
export function emailStatus() {
  return {
    on: !!process.env.EMAIL_FROM,
    welcome_from: COMPANY.welcomeEmail,
    support_from: COMPANY.email,
    from_name: process.env.EMAIL_FROM_NAME || 'PharmacyCDReg.ie',
    mailbox: process.env.EMAIL_MAILBOX || process.env.EMAIL_FROM || null,
    mailbox_set: !!process.env.EMAIL_MAILBOX,
    service_account: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null,
    has_key: !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    admin_notify: process.env.ADMIN_NOTIFY_EMAIL || null,
  };
}

/** Plain-English reason a send failed, from Google's error. */
export function explainEmailError(e: unknown): string {
  const raw = String((e as any)?.response?.data?.error_description || (e as any)?.response?.data?.error?.message || (e as any)?.message || e);
  const m = raw.toLowerCase();
  if (m.includes('unauthorized_client')) return `Google Admin hasn’t allowed the service account to send email: add domain-wide delegation for scope https://www.googleapis.com/auth/gmail.send (can take 10 minutes to apply). [${raw.slice(0, 120)}]`;
  if (m.includes('invalid jwt signature') || m.includes('decoder') || m.includes('pem') || m.includes('private key')) return `The private key in Vercel isn’t right: paste the whole key again, including the BEGIN and END lines. [${raw.slice(0, 120)}]`;
  if (m.includes('invalid_grant') || m.includes('invalid email or user id')) return `EMAIL_MAILBOX must be a real Workspace user (support@pharmacyconsultation.ie), not an alias. [${raw.slice(0, 120)}]`;
  if (m.includes('precondition')) return `Gmail isn’t turned on for that Workspace user. [${raw.slice(0, 120)}]`;
  if (m.includes('has not been used') || m.includes('disabled')) return `The Gmail API isn’t enabled in the service account’s Google Cloud project. [${raw.slice(0, 160)}]`;
  return raw.slice(0, 240);
}
