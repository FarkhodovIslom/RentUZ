'use client';

import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

/**
 * §1.3 item 19 — "So'rovlar" navbar badge: pending-request count, polled
 * every 60 s + on focus (FavoritesBadge pattern). Nothing while anonymous.
 */
export function RequestsBadge() {
  const { data } = useQuery({
    queryKey: ['requests-count'],
    queryFn: async () => {
      try {
        const data = await api.get<{ meta: { total: number } }>(
          '/rental-requests/my?status=PENDING&limit=1',
        );
        return data.meta.total;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 30_000,
  });

  if (data === null || data === undefined || data === 0) return null;

  return (
    <span
      aria-label={`${data} kutayotgan so'rov`}
      className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-black"
    >
      {data > 99 ? '99+' : data}
    </span>
  );
}
