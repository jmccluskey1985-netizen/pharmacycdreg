/**
 * Password-protected Full backup. Runs in the browser (and Node 22), so the password never
 * leaves the pharmacy's computer. scripts/restore-backup.mjs decrypts the same format.
 *   gzip → AES-256-GCM, key from the password with PBKDF2-SHA256 (600,000 rounds, random salt)
 */
export const ENCRYPTED_FORMAT = 'pharmacycdreg-backup-encrypted';
export const MIN_PASSWORD = 10;
const ITERATIONS = 600_000;

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encryptBackup(json: string, password: string): Promise<string> {
  if (password.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters`);
  const c = globalThis.crypto;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const base = await c.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await c.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const data = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, await gzip(json)));
  return JSON.stringify({
    format: ENCRYPTED_FORMAT, version: 1, note: 'PharmacyCDReg.ie full backup, password protected. Restore with scripts/restore-backup.mjs.',
    cipher: 'AES-256-GCM', compressed: 'gzip', kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) }, iv: b64(iv), data: b64(data),
  });
}
