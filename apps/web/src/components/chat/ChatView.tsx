'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import type { ConversationDTOT } from '@rentuz/contracts';
import { useConversations } from '@/hooks/use-conversations';
import { useSocket } from '@/hooks/use-socket';
import { useChatStore } from '@/stores/chat.store';
import { ChatPane } from '@/components/chat/ChatPane';
import { ConversationList } from '@/components/chat/ConversationList';

/**
 * §27 chat surface — split-pane ≥1024 px (list + pane), mobile swaps between
 * them. The (tenant) layout already session-gates this route (owners pass).
 */
function ChatPageInner({ viewerId }: { viewerId: string }) {
  const t = useTranslations('chat');
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data, isLoading } = useConversations();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const [mobilePane, setMobilePane] = useState<'list' | 'chat'>('list');

  useSocket(activeConversationId);

  // Deep-link ?c= param selects the conversation.
  useEffect(() => {
    const fromUrl = searchParams.get('c');
    if (fromUrl) {
      setActiveConversation(fromUrl);
      setMobilePane('chat');
    }
  }, [searchParams, setActiveConversation]);

  const conversations = data?.data ?? [];
  const active: ConversationDTOT | undefined = conversations.find(
    (c) => c.id === activeConversationId,
  );

  // The ?c= conversation may not be in the fetched page yet — a shell row lets
  // the pane open immediately (the list refetch fills the real counterpart).
  const activeShell: ConversationDTOT | undefined =
    active ??
    (activeConversationId
      ? {
          id: activeConversationId,
          counterpart: { id: '', name: '', avatar: null },
          property: { id: '', slug: '', title: '', mainImageUrl: null },
          lastMessageAt: null,
          lastMessagePreview: null,
          unreadCount: 0,
        }
      : undefined);

  const selectConversation = (id: string) => {
    setActiveConversation(id);
    setMobilePane('chat');
    // Reset the badge for the opened conversation (ChatPane auto-reads on open).
    queryClient.setQueryData<{ data: ConversationDTOT[] }>(['conversations'], (current) => {
      if (!current) return current;
      return { data: current.data.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)) };
    });
    router.replace(`/chat?c=${id}`, { scroll: false });
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden rounded-[14px] border border-border bg-card lg:flex-row">
      {/* Left: conversation list (desktop side panel, mobile main pane) */}
      <section
        className={`min-h-0 w-full flex-1 flex-col border-border lg:flex lg:w-80 lg:flex-none lg:border-r ${
          mobilePane === 'list' ? 'flex' : 'hidden'
        }`}
      >
        <header className="border-b border-border px-4 py-3">
          <h1 className="text-base font-semibold">{t('title')}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-sm text-fg-muted">{t('loading')}</p>
          ) : (
            <ConversationList
              conversations={conversations}
              activeId={activeConversationId}
              onSelect={selectConversation}
              onlineUserIds={onlineUsers}
            />
          )}
        </div>
      </section>

      {/* Right: active pane (desktop main, mobile replaces the list) */}
      <section className={`min-h-0 min-w-0 flex-1 ${mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
        {activeShell ? (
          <div className="flex w-full min-w-0">
            <ChatPane
              conversation={activeShell}
              viewerId={viewerId}
              onBack={() => {
                setMobilePane('list');
                setActiveConversation(null);
                router.replace('/chat', { scroll: false });
              }}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-sm text-fg-secondary">{t('pickPrompt')}</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ChatView({ viewerId }: { viewerId: string }) {
  return (
    <Suspense>
      <ChatPageInner viewerId={viewerId} />
    </Suspense>
  );
}
