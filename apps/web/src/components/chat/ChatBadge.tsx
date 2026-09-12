'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import type { PaginatedConversationsT } from '@rentuz/contracts';

/**
 * Total unread chat messages (Σ unreadCount) — 60 s polling fallback per the
 * RequestsBadge pattern; realtime updates land via the socket provider's
 * ['conversations'] cache writes when a chat surface is open.
 */
export function ChatBadge() {
  const { data } = useQuery<number | null>({
    queryKey: ['chat-unread'],
    queryFn: async () => {
      try {
        const page = await api.get<PaginatedConversationsT>('/conversations?limit=50');
        return page.data.reduce((sum, conv) => sum + conv.unreadCount, 0);
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

  if (data === null || data === undefined || data <= 0) return null;
  const label = data > 99 ? '99+' : String(data);
  return (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-black">
      {label}
    </span>
  );
}
