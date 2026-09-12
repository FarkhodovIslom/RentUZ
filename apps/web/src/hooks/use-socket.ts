'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ConversationDTOT, MessageDTOT } from '@rentuz/contracts';
import { getSocket } from '@/lib/socket-client';
import { useChatStore } from '@/stores/chat.store';

export const CONVERSATIONS_KEY = ['conversations'] as const;
export const MESSAGES_KEY = (conversationId: string) => ['messages', conversationId] as const;

/**
 * Mount once per authenticated surface (chat page + nav badge provider).
 * Wires socket events into TanStack Query caches and the Zustand UI store —
 * new messages arrive via `message:new` (no refetch needed); reconnects fall
 * back to refetch-on-reconnect as the durability net (§5 emit-not-durable).
 */
export function useSocket(activeConversationId?: string | null): void {
  const queryClient = useQueryClient();
  const setActive = useChatStore((s) => s.setActiveConversation);
  const setTyping = useChatStore((s) => s.setTyping);
  const setOnline = useChatStore((s) => s.setOnline);
  const setLastReadAt = useChatStore((s) => s.setLastReadAt);
  const clearDraft = useChatStore((s) => s.clearDraft);

  useEffect(() => {
    const socket = getSocket();

    const onMessageNew = (message: MessageDTOT) => {
      // Optimistic pending row resolves once the server row lands.
      useChatStore.getState().resolvePending(message.conversationId, message.id);
      // Upsert into the conversation's flat newest-first cache (MessagePageT).
      const key = MESSAGES_KEY(message.conversationId);
      queryClient.setQueryData<{ data: MessageDTOT[]; hasMore: boolean }>(key, (current) => {
        if (!current) return current;
        if (current.data.some((m) => m.id === message.id)) return current;
        return { ...current, data: [message, ...current.data] };
      });
      // Conversation list: bump preview + unread (unless active — auto-read).
      queryClient.setQueryData<{ data: ConversationDTOT[] }>(CONVERSATIONS_KEY, (current) => {
        if (!current) return current;
        const unreadBump = message.conversationId === activeConversationId ? 0 : 1;
        return {
          data: current.data.map((conv) =>
            conv.id === message.conversationId
              ? {
                  ...conv,
                  lastMessageAt: message.createdAt,
                  lastMessagePreview: message.text.slice(0, 200) || '📷 Rasm',
                  unreadCount: conv.unreadCount + unreadBump,
                }
              : conv,
          ),
        };
      });
      if (message.conversationId === activeConversationId) {
        void fetch(`/api/v1/conversations/${message.conversationId}/read`, { method: 'POST', credentials: 'same-origin' });
      }
    };

    const onConversationNew = () => {
      // New conversation (either side) — refetch the list (row shape needs server data).
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    };

    const onMessageRead = (payload: { userId: string; conversationId: string; readAt: string }) => {
      setLastReadAt(payload.conversationId, payload.readAt);
    };

    const onTyping = (payload: { userId: string; conversationId: string; typing: boolean }) => {
      setTyping(payload.conversationId, payload.userId, payload.typing);
      // A typing counterpart is drafting — clear our own… no: typing comes from
      // the OTHER side; nothing to clear locally.
    };

    const onPresence = (payload: { userId: string; online: boolean }) => {
      setOnline(payload.userId, payload.online);
    };

    const onReady = (payload: { userId: string }) => {
      // Reconnected (possibly with a new socket) — rejoin the active room.
      const active = useChatStore.getState().activeConversationId;
      if (active) {
        socket.emit('conversation:join', { conversationId: active }, () => undefined);
      }
      // Reconnect = potential missed events; refetch truth (durability net).
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void payload;
    };

    socket.on('ready', onReady);
    socket.on('message:new', onMessageNew);
    socket.on('conversation:new', onConversationNew);
    socket.on('message:read', onMessageRead);
    socket.on('typing:update', onTyping);
    socket.on('presence:update', onPresence);

    if (activeConversationId) {
      setActive(activeConversationId);
      socket.emit('conversation:join', { conversationId: activeConversationId }, () => undefined);
      clearDraft(activeConversationId);
    }

    return () => {
      socket.off('ready', onReady);
      socket.off('message:new', onMessageNew);
      socket.off('conversation:new', onConversationNew);
      socket.off('message:read', onMessageRead);
      socket.off('typing:update', onTyping);
      socket.off('presence:update', onPresence);
    };
  }, [activeConversationId, queryClient, setActive, setTyping, setOnline, setLastReadAt, clearDraft]);
}
