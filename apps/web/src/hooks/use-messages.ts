'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessagePageT } from '@rentuz/contracts';
import { api } from '@/lib/api';
import { MESSAGES_KEY } from './use-socket';

/**
 * §45 message history — newest-first flat list in the Query cache; pages
 * prepend as the user scrolls up (`loadOlder` with the oldest id as cursor).
 * Socket `message:new` events upsert the head (see use-socket).
 */
export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: MESSAGES_KEY(conversationId ?? 'none'),
    queryFn: () => api.get<MessagePageT>(`/conversations/${conversationId}/messages?limit=30`),
    enabled: conversationId !== null,
    staleTime: 30_000,
  });

  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (!conversationId) return false;
    const cached = queryClient.getQueryData<MessagePageT>(MESSAGES_KEY(conversationId));
    // Newest-first list: the OLDEST message is the last array element.
    const oldest = cached?.data?.[cached.data.length - 1]?.id;
    if (!oldest || !cached?.hasMore) return false;
    const older = await api.get<MessagePageT>(
      `/conversations/${conversationId}/messages?limit=30&before=${oldest}`,
    );
    queryClient.setQueryData<MessagePageT>(MESSAGES_KEY(conversationId), (current) => ({
      data: [...older.data, ...(current?.data ?? [])],
      hasMore: older.hasMore,
    }));
    return older.hasMore;
  }, [conversationId, queryClient]);

  return { ...query, loadOlder };
}
