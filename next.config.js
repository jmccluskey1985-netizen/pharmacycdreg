/** @type {import('next').NextConfig} */
// Vercel won't let NEXT_PUBLIC_* vars be "sensitive", so we also accept
// SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY and map them at build time.
// Values are picked by what they look like, so a key pasted in the URL box
// (or vice versa) still works.
const candidates = [
  process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.SUPABASE_PUBLISHABLE_KEY, process.env.SUPABASE_ANON_KEY,
].map((v) => (v || '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);

const isKey = (v) => /^sb_publishable_/.test(v) || /^eyJ/.test(v);
function cleanUrl(raw) {
  let u = raw;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
}
const urlRaw = candidates.find((v) => !isKey(v) && /supabase\.(co|in)|^https?:\/\//i.test(v)) || '';
const supabaseUrl = urlRaw ? cleanUrl(urlRaw) : '';
const supabaseAnon = candidates.find(isKey) || '';

if (!supabaseUrl) console.warn('\n⚠️  No Supabase project URL found. Set SUPABASE_URL to https://<project>.supabase.co\n');
if (!supabaseAnon) console.warn('\n⚠️  No Supabase publishable key found. Set SUPABASE_PUBLISHABLE_KEY\n');

module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return process.env.SIGNUPS_OPEN === '1' ? [] : [{ source: '/start', destination: '/', permanent: false }];
  },
  env: { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnon },
};
