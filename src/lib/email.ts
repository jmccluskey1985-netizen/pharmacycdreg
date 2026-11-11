/**
 * Email via Gmail API + Google service account with domain-wide delegation —
 * the same setup PharmacyConsultation.ie uses. If it isn't configured the email
 * is skipped (logged), never fatal: billing and the register must not depend on it.
 */
import { gmail } from '@googleapis/gmail';
import { JWT } from 'google-auth-library';

const enc = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf-8').toString('base64')}?=`);

export const adminEmail = () => process.env.ADMIN_NOTIFY_EMAIL || process.env.EMAIL_FROM || '';

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const from = process.env.EMAIL_FROM;
  const fromName = process.env.EMAIL_FROM_NAME || 'PharmacyCDReg.ie';
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!to || !from || !key || !clientEmail) {
    console.warn('[email] not configured — skipped:', subject);
    return { sent: false };
  }
  try {
    const auth = new JWT({ email: clientEmail, key, scopes: ['https://www.googleapis.com/auth/gmail.send'], subject: from });
    const raw = [
      `From: "${enc(fromName)}" <${from}>`,
      `To: ${to}`,
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
    return { sent: false };
  }
}
