import { createSign } from 'crypto';

/**
 * Google Vertex AI (Gemini) for reading documents, kept in the EU.
 * - location "eu" (default) uses the EU multi-region endpoint, which keeps ML processing of
 *   customer data within the EU; a single region (e.g. europe-west1) uses its regional endpoint.
 * - Auth is a service account (role "Vertex AI User"); we sign a short JWT and swap it for an
 *   access token, cached until shortly before it expires.
 */
export interface VertexCredentials { client_email: string; private_key: string; project_id: string }

export const VERTEX_LOCATIONS = [
  { id: 'eu', label: 'EU multi-region (recommended — processing stays in the EU)' },
  { id: 'europe-west1', label: 'Belgium (europe-west1)' },
  { id: 'europe-west4', label: 'Netherlands (europe-west4)' },
  { id: 'europe-west3', label: 'Frankfurt (europe-west3)' },
  { id: 'europe-west9', label: 'Paris (europe-west9)' },
] as const;

export function vertexHost(location: string): string {
  // Multi-regions use the ".rep" host with the location in the path; regions use "<region>-aiplatform".
  if (location === 'eu' || location === 'us') return `https://aiplatform.${location}.rep.googleapis.com`;
  if (!/^[a-z]+-[a-z]+\d+$/.test(location)) throw new Error('Unknown Vertex AI location');
  return `https://${location}-aiplatform.googleapis.com`;
}

export function vertexUrl(c: { project_id: string }, location: string, model: string): string {
  return `${vertexHost(location)}/v1/projects/${encodeURIComponent(c.project_id)}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

/** Parse and sanity-check a pasted service-account key file. */
export function parseServiceAccount(json: string): VertexCredentials {
  let d: any;
  try { d = JSON.parse(json); } catch { throw new Error('That isn’t a valid key file — paste the whole JSON file.'); }
  if (d?.type !== 'service_account' || typeof d.client_email !== 'string' || typeof d.private_key !== 'string' || typeof d.project_id !== 'string' || !d.private_key.includes('PRIVATE KEY')) {
    throw new Error('That isn’t a Google Cloud service-account key (it needs type, project_id, client_email and private_key).');
  }
  return { client_email: d.client_email, private_key: d.private_key, project_id: d.project_id };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const tokens = new Map<string, { token: string; exp: number }>();

export async function vertexAccessToken(c: VertexCredentials, fetcher: typeof fetch = fetch): Promise<string> {
  const cached = tokens.get(c.client_email);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: c.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claims}`);
  const jwt = `${head}.${claims}.${b64url(signer.sign(c.private_key))}`;
  const res = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw new Error(d.error_description || d.error || `Google sign-in failed (HTTP ${res.status})`);
  tokens.set(c.client_email, { token: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 });
  return d.access_token;
}
