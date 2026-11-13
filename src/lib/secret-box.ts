import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

/**
 * Encrypt small secrets (e.g. a pharmacy's OpenRouter key) before they go in the database.
 * AES-256-GCM with a key derived from SECRETS_KEY (or STAFF_SESSION_SECRET if that isn't set).
 * Changing that secret makes stored keys unreadable, they'd need to be entered again.
 */
function key(): Buffer {
  const base = process.env.SECRETS_KEY || process.env.STAFF_SESSION_SECRET;
  if (!base || base.length < 32) throw new Error('SECRETS_KEY or STAFF_SESSION_SECRET (32+ chars) must be set');
  return Buffer.from(hkdfSync('sha256', base, 'pharmacycdreg', 'stored-secrets-v1', 32));
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function open(sealed: string): string | null {
  try {
    const [v, iv, tag, body] = sealed.split('.');
    if (v !== 'v1') return null;
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
