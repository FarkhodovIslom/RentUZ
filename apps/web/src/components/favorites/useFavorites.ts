'use client';

import { useQuery, type useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

/**
 * Shared favorites state (client): one query holds the user's favorited
 * property ids; the heart button and the navbar badge both read from it.
 * Anonymous visitors resolve to `null` (single cheap 401 probe, no retry).
 */
export const FAVORITE_IDS_KEY = ['favorites', 'ids'] as const;

async function fetchFavoriteIds(): Promise<Set<string> | null> {
  try {
    const data = await api.get<{ data: { id: string }[] }>('/favorites?limit=100');
    return new Set(data.data.map((p) => p.id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useFavoriteIds() {
  return useQuery({
    queryKey: FAVORITE_IDS_KEY,
    queryFn: fetchFavoriteIds,
    staleTime: 60_000,
    retry: false,
  });
}

/** Anonymous intent hand-off: the login page redirects back, then the button replays it. */
export const PENDING_FAVORITE_KEY = 'rentuz:pending-favorite';

export function invalidateFavorites(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: FAVORITE_IDS_KEY });
  void queryClient.invalidateQueries({ queryKey: ['favorites-count'] });
  void queryClient.invalidateQueries({ queryKey: ['favorites-list'] });
}
