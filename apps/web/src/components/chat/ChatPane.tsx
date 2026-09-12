'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { ConversationDTOT } from '@rentuz/contracts';
import { api } from '@/lib/api';
import { useMessages } from '@/hooks/use-messages';
import { useChatStore } from '@/stores/chat.store';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';
import { OnlineDot } from './OnlineDot';
import { TypingIndicator } from './TypingIndicator';
import { Button } from '@rentuz/ui';

/**
 * §27 active conversation pane — header (counterpart + online dot + property),
 * newest-at-bottom message stack, load-older trigger, composer. Mobile shows
 * this full-screen (the list swaps out); desktop sits beside it.
 */
export function ChatPane({
  conversation,
  viewerId,
  onBack,
}: {
  conversation: ConversationDTOT;
  viewerId: string;
  onBack?: () => void;
}) {
  const t = useTranslations('chat');
  const { data, isLoading, loadOlder, refetch } = useMessages(conversation.id);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const typingByConversation = useChatStore((s) => s.typingByConversation);
  const counterpartLastReadAt = useChatStore((s) => s.counterpartLastReadAt);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = data?.data ?? [];
  const typingUsers = typingByConversation[conversation.id] ?? new Set<string>();
  const lastReadAt = counterpartLastReadAt[conversation.id] ?? conversation.lastMessageAt;
  const lastOwnMessage = [...messages].reverse().find((m) => m.senderId === viewerId);
  const online = onlineUsers.has(conversation.counterpart.id);

  // Mark read on open + when already at the bottom (auto-read).
  useEffect(() => {
    void api.post(`/conversations/${conversation.id}/read`).catch(() => undefined);
  }, [conversation.id]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const typingVisible = [...typingUsers].some((uid) => uid === conversation.counterpart.id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} aria-label={t('back')}>
            ←
          </Button>
        ) : null}
        <OnlineDot online={online} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{conversation.counterpart.name}</p>
          <p className="truncate text-xs text-fg-muted">{conversation.property.title}</p>
        </div>
        <span className="text-[10px] uppercase text-fg-muted">{online ? t('online') : t('offline')}</span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-fg-muted">{t('loading')}</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">{t('emptyConv')}</p>
        ) : null}
        {data?.hasMore ? (
          <div className="flex justify-center pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void loadOlder().then((hasMore) => {
                  if (!hasMore) void refetch();
                });
              }}
            >
              {t('loadOlder')}
            </Button>
          </div>
        ) : null}
        {/* Oldest-first rendering — the API cache is newest-first. */}
        {[...messages].reverse().map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            own={message.senderId === viewerId}
            conversationId={conversation.id}
            showReadReceipt={
              message.id === lastOwnMessage?.id &&
              lastReadAt !== null &&
              new Date(lastReadAt as unknown as string) >= new Date(message.createdAt as unknown as string)
            }
          />
        ))}
        <TypingIndicator visible={typingVisible} />
        <div ref={bottomRef} />
      </div>

      <Composer conversationId={conversation.id} />
    </div>
  );
}
