'use client';

import { useTranslations } from 'next-intl';
import type { ConversationDTOT } from '@rentuz/contracts';
import { OnlineDot } from './OnlineDot';
import { UnreadBadge } from './UnreadBadge';

function previewLine(conv: ConversationDTOT): string {
  return conv.lastMessagePreview ?? 'Hali xabar yo‘q — yozing!';
}

function timeLabel(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit' }).format(new Date(iso));
}

/** §27 conversation list — counterpart + property, last message, unread badge. */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onlineUserIds,
}: {
  conversations: ConversationDTOT[];
  activeId: string | null;
  onSelect: (conversationId: string) => void;
  onlineUserIds: Set<string>;
}) {
  const t = useTranslations('chat');

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm text-fg-secondary">{t('empty')}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {conversations.map((conv) => {
        const active = conv.id === activeId;
        return (
          <li key={conv.id}>
            <button
              type="button"
              onClick={() => onSelect(conv.id)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated/50 ${
                active ? 'bg-elevated' : ''
              }`}
            >
              <OnlineDot online={onlineUserIds.has(conv.counterpart.id)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{conv.counterpart.name}</span>
                  <span className="shrink-0 text-[10px] text-fg-muted">
                    {timeLabel(conv.lastMessageAt as unknown as string)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-fg-secondary">{previewLine(conv)}</span>
                  <UnreadBadge count={conv.unreadCount} />
                </span>
                <span className="mt-1 truncate text-[10px] text-fg-muted">{conv.property.title}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
