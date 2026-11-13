// Vertex AI reader against a fake Google (no network): URLs, auth, fallbacks, parsing.
import { generateKeyPairSync } from 'crypto';
import { extractViaVertex, parseJsonWith } from '../../src/lib/scan-extract';
import { parseServiceAccount, vertexUrl } from '../../src/lib/vertex';
import { z } from 'zod';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = JSON.stringify({ type: 'service_account', project_id: 'cdreg-test', client_email: 'reader@cdreg-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const creds = parseServiceAccount(sa);

eq('EU multi-region URL', vertexUrl(creds, 'eu', 'gemini-3.8-flash'), 'https://aiplatform.eu.rep.googleapis.com/v1/projects/cdreg-test/locations/eu/publishers/google/models/gemini-3.8-flash:generateContent');
eq('regional URL', vertexUrl(creds, 'europe-west1', 'gemini-2.5-flash'), 'https://europe-west1-aiplatform.googleapis.com/v1/projects/cdreg-test/locations/europe-west1/publishers/google/models/gemini-2.5-flash:generateContent');
let bad = ''; try { parseServiceAccount('{"type":"authorized_user"}'); } catch (e) { bad = (e as Error).message; }
eq('rejects a non-service-account file', /service-account/.test(bad), true);

const calls: { url: string; body?: any }[] = [];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// 3.8 not served → 404; 2.5 rejects the schema → 400; then plain JSON works.
const fake: typeof fetch = async (input, init) => {
  const url = String(input);
  const body = init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : undefined;
  calls.push({ url, body });
  if (url.startsWith('https://oauth2.googleapis.com/token')) return json(200, { access_token: 'tok', expires_in: 3600 });
  if (url.includes('gemini-3.8-flash')) return json(404, { error: { message: 'Publisher Model was not found' } });
  if (body?.generationConfig?.responseJsonSchema) return json(400, { error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"' } });
  return json(200, { modelVersion: 'gemini-2.5-flash-001', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok": true, "colour": "white"}' }] } }] });
};
const Schema = z.object({ ok: z.boolean(), colour: z.string().nullable() });
const out = await extractViaVertex([{ base64: 'AAAA', mediaType: 'image/png' }], {
  system: 'sys', schema: { type: 'object' }, name: 't', prompt: 'read', parse: parseJsonWith(Schema),
}, { credentials: creds, location: 'eu', models: ['gemini-3.8-flash', 'gemini-2.5-flash'] }, fake);
eq('result parsed', out.result, { ok: true, colour: 'white' });
eq('model label', out.model, 'vertex:gemini-2.5-flash-001@eu (json mode)');
eq('token requested once with a signed JWT', calls.filter((c) => c.url.includes('oauth2')).length, 1);
eq('order: 3.8 → 2.5 strict → 2.5 json', calls.filter((c) => !c.url.includes('oauth2')).map((c) => `${c.url.match(/models\/([^:]+)/)![1]}:${c.body.generationConfig.responseJsonSchema ? 'strict' : 'json'}`), ['gemini-3.8-flash:strict', 'gemini-2.5-flash:strict', 'gemini-2.5-flash:json']);
eq('photo sent as inline data', calls[1].body.contents[0].parts[0].inlineData.mimeType, 'image/png');

// 403 → clear message about the role
const denied: typeof fetch = async (input) => String(input).includes('oauth2') ? json(200, { access_token: 't2', expires_in: 3600 }) : json(403, { error: { message: 'Permission denied on resource' } });
let msg = '';
try { await extractViaVertex([{ base64: 'AAAA', mediaType: 'image/png' }], { system: 's', schema: {}, name: 't', prompt: 'p', parse: parseJsonWith(Schema) }, { credentials: { ...creds, client_email: 'other@x.iam.gserviceaccount.com' }, location: 'eu', models: ['gemini-2.5-flash'] }, denied); } catch (e) { msg = (e as Error).message; }
eq('permission error explains the role', /Vertex AI User/.test(msg), true);

console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
process.exit(fail ? 1 : 0);
