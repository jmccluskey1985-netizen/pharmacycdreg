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
// The project URL is public (every browser sees it), so a default is safe to keep here.
const DEFAULT_SUPABASE_URL = 'https://uoqlsdryukxmobuqgqiq.supabase.co';
const urlRaw = candidates.find((v) => !isKey(v) && /supabase\.(co|in)|^https?:\/\//i.test(v)) || DEFAULT_SUPABASE_URL;
const supabaseUrl = urlRaw ? cleanUrl(urlRaw) : '';
const supabaseAnon = candidates.find(isKey) || '';

if (!supabaseUrl) console.warn('\n⚠️  No Supabase project URL found. Set SUPABASE_URL to https://<project>.supabase.co\n');
if (!supabaseAnon) console.warn('\n⚠️  No Supabase publishable key found. Set SUPABASE_PUBLISHABLE_KEY\n');

// Security headers on every response. The CSP only applies to production builds (the dev
// server needs eval). Everything the browser loads comes from this site, except the
// Supabase API it talks to for sign-in.
const prod = process.env.NODE_ENV === 'production';
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl || 'https://*.supabase.co'} https://*.supabase.co wss://*.supabase.co`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(prod ? [{ key: 'Content-Security-Policy', value: csp }] : []),
];

module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Never cache API answers (patient data) in shared caches.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
  async redirects() {
    return process.env.SIGNUPS_OPEN === '1' ? [] : [{ source: '/start', destination: '/', permanent: false }];
  },
  env: { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnon },
};
