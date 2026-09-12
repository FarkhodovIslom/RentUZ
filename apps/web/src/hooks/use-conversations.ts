'use client';

import { useQuery } from '@tanstack/react-query';
import type { PaginatedConversationsT } from '@rentuz/contracts';
import { api } from '@/lib/api';
import { CONVERSATIONS_KEY } from './use-socket';

/** §45 conversation list — one page is the MVP surface (≤50 convs typical). */
export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => api.get<PaginatedConversationsT>('/conversations?limit=50'),
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if ('status' in error && (error as { status: number }).status === 401) return false;
      return failureCount < 1;
    },
  });
}
