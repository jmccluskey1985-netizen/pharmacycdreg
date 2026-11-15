import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { buildCsp, newNonce } from '@/lib/csp';

// Other security headers are set in next.config.js; the CSP is per request (it carries a nonce).
const PROD = process.env.NODE_ENV === 'production';

const CANONICAL_HOST = process.env.CANONICAL_HOST || 'pharmacycdreg.ie';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Next.js reads the nonce from the request's CSP header and puts it on its own scripts.
  const nonce = newNonce();
  const csp = buildCsp(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (PROD) { request.headers.set('x-nonce', nonce); request.headers.set('content-security-policy', csp); }
  const withHeaders = (response: NextResponse) => {
    if (PROD) response.headers.set('Content-Security-Policy', csp);
    return response;
  };
  // One address, one login: www and the vercel.app address keep separate cookies, so
  // send everyone to the main domain (production only; previews keep their own URL).
  const host = (request.headers.get('host') || '').toLowerCase();
  if (host === `www.${CANONICAL_HOST}` || (process.env.VERCEL_ENV === 'production' && host.endsWith('.vercel.app'))) {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = 'https';
    url.port = '';
    return withHeaders(NextResponse.redirect(url, 308));
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_DEMO_MODE === '1') return withHeaders(NextResponse.next({ request }));

  try {
    const { response, user, needsCode } = await updateSession(request);
    // A redirect must carry any refreshed sign-in cookies; otherwise the rotated refresh token
    // is lost and the pharmacy gets signed out next time.
    const redirect = (url: URL) => {
      const r = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => r.cookies.set(c));
      return withHeaders(r);
    };
    // Already signed in? The home page goes straight to the register (add ?home=1 to see it).
    if (pathname === '/' && user && !needsCode && !request.nextUrl.searchParams.has('home') && !request.nextUrl.searchParams.has('code')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return redirect(url);
    }
    if (pathname.startsWith('/dashboard') && user && needsCode) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      url.searchParams.set('code', '1');
      url.searchParams.set('next', pathname);
      return redirect(url);
    }
    // Dashboard needs the pharmacy login; send people back to the landing-page sign-in.
    if (pathname.startsWith('/dashboard') && !user) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('next', pathname);
      return redirect(url);
    }
    return withHeaders(response);
  } catch (err) {
    // A misconfigured Supabase URL/key must never take the whole site down.
    // Public pages still load; the dashboard bounces to the landing page, and the
    // API routes return the actual configuration error.
    console.error('[middleware] supabase session check failed:', err instanceof Error ? err.message : err);
    if (pathname.startsWith('/dashboard')) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('next', pathname);
      return withHeaders(NextResponse.redirect(url));
    }
    return withHeaders(NextResponse.next({ request }));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)'],
};
