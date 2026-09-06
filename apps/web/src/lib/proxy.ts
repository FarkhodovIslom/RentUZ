import type { NextRequest } from 'next/server';

/**
 * BFF proxy (0_Phase.md §2 "Auth transport"): the browser only ever calls
 * same-origin `/api/v1/...`; this handler forwards to INTERNAL_API_URL with
 * cookies attached. `Set-Cookie` responses get their `Domain=` attribute
 * stripped so cookies stay host-only on the web origin (§53).
 */

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
]);

function sanitizeSetCookie(value: string): string {
  return value
    .split(/(?<=\b(?:Path|SameSite|Secure|HttpOnly)[^\s]*),|,(?=\s*(?:Path|SameSite|Secure|HttpOnly)=)/gi)
    .map((part) => part.trim())
    .filter((attr) => !/^Domain=/i.test(attr))
    .join('; ');
}

export async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const url = new URL(
    `/api/v1/${path.join('/')}${request.nextUrl.search}`,
    INTERNAL_API_URL,
  );

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === 'host' || lower === 'content-length') continue;
    headers.set(name, value);
  }
  // The API must see the original client IP for rate limiting.
  headers.set('x-forwarded-for', request.headers.get('x-forwarded-for') ?? 'unknown');
  headers.set('x-forwarded-host', request.nextUrl.host);

  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();

  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return; // handled separately below
    if (HOP_BY_HOP.has(name.toLowerCase())) return;
    responseHeaders.set(name, value);
  });

  // Express may return multiple Set-Cookie headers — collect and sanitize each.
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    responseHeaders.append('set-cookie', sanitizeSetCookie(cookie));
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
