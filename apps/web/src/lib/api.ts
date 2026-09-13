import type { ApiFailure, ApiResponse, CsrfTokenDTOT } from '@rentuz/contracts';

/**
 * Browser-side fetch wrapper — always relative `/api/v1/...` through the BFF
 * (0_Phase.md §2 BFF rule). Cookies ride along automatically.
 *
 * CSRF (Phase 8, §53): mutating calls carry the double-submit token in
 * `x-rentuz-csrf`. The token is fetched once per page load from /csrf
 * (HttpOnly cookie + JSON value) and cached in memory; a stale/rotated
 * server token surfaces as the BFF's 403, which re-fetches once and retries.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetch the double-submit token. NO memoization: every GET /csrf rotates
 * the HttpOnly cookie AND returns the matching token, so a fresh fetch per
 * mutating call keeps the pair always in sync (a cached token goes stale the
 * moment anything else fetches — the BFF then 403s and the app wedges, seen
 * in the Phase 8 chat E2E). Parallel callers share one in-flight promise.
 */
let csrfInFlight: Promise<string> | null = null;

/** Public: raw-fetch callers (multipart uploads, socket ticket) need it too. */
export function fetchCsrfToken(): Promise<string> {
  if (!csrfInFlight) {
    csrfInFlight = fetch('/api/v1/csrf', { credentials: 'same-origin' })
      .then((res) => res.json() as Promise<ApiResponse<CsrfTokenDTOT>>)
      .then((payload) => {
        if (payload.success === false || !payload.data?.token) {
          throw new Error('CSRF token olinmadi');
        }
        return payload.data.token;
      })
      .finally(() => {
        csrfInFlight = null;
      });
  }
  return csrfInFlight;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  // Mutating BFF calls require the CSRF double-submit header.
  if (init?.method && init.method !== 'GET' && init.method !== 'HEAD' && !path.startsWith('/csrf')) {
    headers['x-rentuz-csrf'] = await fetchCsrfToken().catch(() => '');
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !payload || payload.success === false) {
    const failure = payload as ApiFailure | null;
    throw new ApiError(
      response.status,
      failure?.error?.code ?? 'INTERNAL_ERROR',
      failure?.message ?? 'Nimadir noto‘g‘ri ketdi',
      (failure as { retryAfter?: number } | null)?.retryAfter,
    );
  }
  return payload.data;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
