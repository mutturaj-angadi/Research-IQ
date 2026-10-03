import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic gate only: redirects cookie-less visitors away from app pages. Real authentication and
 * authorization (signature, expiry, active user, role) are enforced server-side in pages and route handlers.
 */
const PROTECTED = ['/dashboard', '/papers', '/search', '/semantic-search', '/ask', '/saved', '/history', '/questions', '/admin'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) && !req.cookies.get('riq_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
