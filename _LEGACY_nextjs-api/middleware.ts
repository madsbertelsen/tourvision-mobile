import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
import { guestRegex, isDevelopmentEnvironment } from './lib/constants';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith('/ping')) {
    return new Response('pong', { status: 200 });
  }

  // Serve Expo static assets (must come before other checks)
  if (pathname.startsWith('/_expo/') || pathname.startsWith('/assets/')) {
    return NextResponse.next();
  }

  // Serve Expo app at root by rewriting to index.html
  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/index.html', request.url));
  }

  // Allow Expo app routes to pass through (public access)
  if (pathname.startsWith('/(') ||  // Expo route groups like (mock), (auth), (public)
      pathname.startsWith('/location/') ||
      pathname.startsWith('/trip/') ||
      pathname.startsWith('/simple-map-test') ||
      pathname === '/test-map-clean' ||
      pathname.endsWith('.html')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Allow places, route, transportation, chat, chat-simple, and generate-prosemirror-proposal APIs to bypass auth for server-side enrichment
  if (pathname.startsWith('/api/places') ||
      pathname.startsWith('/api/route') ||
      pathname.startsWith('/api/transportation') ||
      pathname.startsWith('/api/chat') ||
      pathname.startsWith('/api/chat-simple') ||
      pathname.startsWith('/api/generate-prosemirror-proposal')) {
    const response = NextResponse.next();

    // Add CORS headers for these API routes
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');

    return response;
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (!token) {
    // If trying to access login or register, allow it
    if (pathname === '/login' || pathname === '/register') {
      return NextResponse.next();
    }

    // Otherwise redirect to login
    const redirectUrl = encodeURIComponent(request.url);
    return NextResponse.redirect(
      new URL(`/login?redirectUrl=${redirectUrl}`, request.url),
    );
  }

  const isGuest = guestRegex.test(token?.email ?? '');

  if (token && !isGuest && ['/login', '/register'].includes(pathname)) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin',
    '/chat/:id',
    '/api/:path*',
    '/login',
    '/register',
    '/_expo/:path*',  // Include Expo static bundles
    '/assets/:path*',  // Include Expo assets

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - Static HTML files from Expo (*.html)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.html).*)',
  ],
};
