/** @type {import('next').NextConfig} */

// Vercel can refuse to save NEXT_PUBLIC_* variables marked sensitive. So the app also
// accepts SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) and exposes
// them to the browser here at build time. The URL and publishable/anon key are public
// by design; the secret key is never exposed.
function cleanUrl(raw) {
  let u = (raw || '').trim().replace(/^["']|["']$/g, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
}
const supabaseUrl = cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
const supabaseAnon = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pre-launch: self sign-up is closed; /start goes to the waitlist on the home page.
  async redirects() {
    return process.env.SIGNUPS_OPEN === '1' ? [] : [{ source: '/start', destination: '/', permanent: false }];
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnon,
  },
};
