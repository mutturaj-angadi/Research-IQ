import { NextResponse, type NextRequest } from 'next/server';
import { createContentSecurityPolicy } from './lib/security/csp';

/**
 * Optimistic gate only: redirects cookie-less visitors away from app pages. Real authentication and
 * authorization (signature, expiry, active user, role) are enforced server-side in pages and route handlers.
 */
const PROTECTED = ['/dashboard', '/papers', '/search', '/semantic-search', '/ask', '/saved', '/history', '/questions', '/admin'];

function applyCsp(response: NextResponse, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', createContentSecurityPolicy(nonce, process.env.NODE_ENV === 'production'));
  return response;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', createContentSecurityPolicy(nonce, process.env.NODE_ENV === 'production'));
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) && !req.cookies.get('riq_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return applyCsp(NextResponse.redirect(url), nonce);
  }
  return applyCsp(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
