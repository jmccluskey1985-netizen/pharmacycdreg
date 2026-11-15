/**
 * Content Security Policy. Scripts only run if they carry this request's nonce (or were loaded
 * by one that did), so injected inline script can't run. Applied by src/proxy.ts to every page.
 * Styles still allow inline (React style attributes need it).
 */
export function buildCsp(nonce: string, supabaseUrl?: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
}

export const newNonce = () => btoa(crypto.randomUUID());
