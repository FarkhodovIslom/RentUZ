import { cookies } from 'next/headers';
import type { ApiResponse, ApiFailure } from '@rentuz/contracts';

/**
 * Server-component fetch helper — RSC pages call the Nest API directly at
 * INTERNAL_API_URL (0_Phase.md §2 BFF rule: the BFF is for browser traffic;
 * server components skip the round trip through our own HTTP layer).
 *
 * The browser wrapper stays in `lib/api.ts` (relative /api/v1 via the BFF).
 */
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

export async function serverApiGet<T>(path: string): Promise<T> {
  // Forward the visitor's cookies: authenticated RSC pages (favorites) need
  // the `rentuz_at` cookie to reach the API — the guard accepts it directly.
  const cookieStore = await cookies();
  const response = await fetch(`${INTERNAL_API_URL}/api/v1${path}`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });
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
