import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next();

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { response: r, user } = await updateSession(request);
    response = r;
    // Dashboard needs the pharmacy login; send people back to the landing-page sign-in.
    if (pathname.startsWith('/dashboard') && !user) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)'],
};
