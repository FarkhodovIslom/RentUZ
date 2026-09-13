import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * CSP header (§53 / 8_Phase.md §1.3 item 13) — Next 16 + Turbopack ships
 * non-nonceable inline RSC bootstrap scripts, so script-src keeps
 * 'unsafe-inline' for the framework's own hydration payload. External
 * scripts stay same-origin; React escaping + the §1.3 XSS tests carry the
 * injected-script defense. (A strict nonce policy would blank the app —
 * Turbopack does not implement the request-CSP nonce propagation webpack
 * had, verified 2026-09-13.)
 *
 * - `connect-src` includes the WS origin (NEXT_PUBLIC_SOCKET_URL — Vercel
 *   cannot proxy WebSockets, the chat client connects directly) and Sentry.
 * - `img-src` covers the storage hosts (local MinIO dev, Supabase prod).
 */

const API_HOSTS = [process.env.NEXT_PUBLIC_SOCKET_URL, 'https://*.sentry.io']
  .filter((host): host is string => Boolean(host))
  .map((host) => {
    // The socket URL is http(s); WS upgrades need the ws(s) scheme in CSP.
    const url = new URL(host);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${host} ${wsProtocol}//${url.host}`;
  })
  .join(' ');

function csp(): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' https://*.sentry.io`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://*.supabase.co https://*.r2.cloudflarestorage.com https://*.amazonaws.com http://localhost:9000 https://tile.openstreetmap.org https://*.maptiler.com`,
    `connect-src 'self' ${API_HOSTS} wss://api.rentuz.uz https://tile.openstreetmap.org https://*.maptiler.com`,
    `font-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ].join('; ');
}

export default function proxy(_request: NextRequest): NextResponse {
  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', csp());
  return response;
}

export const config = {
  // API routes carry their own headers (the BFF forwards upstream ones);
  // static assets need none. Everything else gets the CSP.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon|robots.txt|sitemap|manifest.webmanifest).*)'],
};
