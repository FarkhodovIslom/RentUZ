import { revalidatePath } from 'next/cache';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * ISR revalidation hook (8_Phase.md §1.1 item 4): the API calls this after a
 * property mutation lands (price edit, verification) so cached detail pages
 * and the sitemap pick up fresh data within seconds instead of waiting out
 * the 10-min `revalidate` window.
 *
 * Auth: shared `REVALIDATE_SECRET` bearer token — API-server-only route, never
 * exposed to the browser (unlike /api/v1/* it is not a BFF passthrough).
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { slug?: string } | null;
  if (body?.slug) {
    // Slug may be a UUID (old URLs) — revalidatePath accepts the route shape.
    revalidatePath(`/property/${body.slug}`);
  }
  revalidatePath('/sitemap.xml');
  return NextResponse.json({ success: true, data: { revalidated: true }, message: 'OK' });
}
