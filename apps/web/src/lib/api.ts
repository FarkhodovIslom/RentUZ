import type { ApiFailure, ApiResponse } from '@rentuz/contracts';

/**
 * Browser-side fetch wrapper — always relative `/api/v1/...` through the BFF
 * (0_Phase.md §2 BFF rule). Cookies ride along automatically.
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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
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
