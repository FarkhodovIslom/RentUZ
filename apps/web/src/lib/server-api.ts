import { cookies } from 'next/headers';
import type { ApiResponse, ApiFailure } from '@rentuz/contracts';

/**
 * Server-component fetch helper — RSC pages call the Nest API directly at
 * INTERNAL_API_URL (0_Phase.md §2 BFF rule: the BFF is for browser traffic;
 * server components skip the round trip through our own HTTP layer).
 *
 * The browser wrapper stays in `lib/api.ts` (relative /api/v1 via the BFF).
 *
 * `cache` (Phase 8): ISR pages (`revalidate = N`) must not issue `no-store`
 * fetches — Next 16 throws DYNAMIC_SERVER_USAGE inside a cached segment.
 * Default stays `no-store` (authenticated pages need fresh data + cookies);
 * ISR call sites pass `{ next: { revalidate } }` so the segment caches
 * end-to-end and the API hook can purge it via revalidatePath.
 */
export interface ServerApiCache {
  next?: { revalidate?: number | false; tags?: string[] };
  forceNoStore?: boolean;
}

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:4000';

export class ServerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

export async function serverApiGet<T>(path: string, cache?: ServerApiCache): Promise<T> {
  // Forward the visitor's cookies ONLY for no-store reads: authenticated RSC
  // pages (favorites) need the `rentuz_at` cookie — the guard accepts it
  // directly. Cached/ISR reads skip cookies(): awaiting it would flip the
  // segment dynamic (DYNAMIC_SERVER_USAGE) and public pages are anonymous.
  const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {};
  if (cache?.next) {
    init.next = cache.next;
  } else {
    init.headers = { Cookie: (await cookies()).toString() };
    init.cache = 'no-store';
  }
  const response = await fetch(`${INTERNAL_API_URL}/api/v1${path}`, init);
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | ApiFailure | null;
  if (!response.ok || !payload || payload.success === false) {
    const failure = payload as ApiFailure | null;
    throw new ServerApiError(
      response.status,
      failure?.error?.code ?? 'INTERNAL_ERROR',
      failure?.message ?? 'API xatosi',
    );
  }
  return payload.data;
}
