import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

function withHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return withHeaders(NextResponse.next());

  try {
    const { response, user } = await updateSession(request);
    // Dashboard needs the pharmacy login; send people back to the landing-page sign-in.
    if (pathname.startsWith('/dashboard') && !user) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
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
      return NextResponse.redirect(url);
    }
    return withHeaders(NextResponse.next());
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)'],
};
