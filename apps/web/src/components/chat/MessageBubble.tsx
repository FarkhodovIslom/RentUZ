'use client';

import type { MessageDTOT } from '@rentuz/contracts';
import { AttachmentPreview } from './AttachmentPreview';

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('uz-UZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/**
 * §27 message bubble — own messages right-aligned (primary accent), the
 * counterpart's left. Read receipts ("O'qilgan") on the last own message
 * once the counterpart's lastReadAt covers it.
 */
export function MessageBubble({
  message,
  own,
  showReadReceipt,
  conversationId,
  pending = false,
}: {
  message: MessageDTOT;
  own: boolean;
  showReadReceipt?: boolean;
  conversationId: string;
  pending?: boolean;
}) {
  return (
    <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] space-y-1 ${own ? 'items-end' : 'items-start'} flex flex-col`}>
        {message.attachments?.map((a) => (
          <AttachmentPreview key={a.key} conversationId={conversationId} attachmentKey={a.key} />
        ))}
        {message.text ? (
          <div
            className={`rounded-[14px] px-3 py-2 text-sm ${
              own
                ? 'bg-primary/20 text-fg'
                : 'bg-elevated text-fg'
            } ${pending ? 'opacity-60' : ''}`}
          >
            {message.text}
          </div>
        ) : null}
        <div className="flex items-center gap-1.5 px-1 text-[10px] text-fg-muted">
          <span>{formatTime(message.createdAt as unknown as string)}</span>
          {own && showReadReceipt && !pending ? <span className="text-primary">O'qilgan</span> : null}
          {pending ? <span>Yuborilmoqda…</span> : null}
        </div>
      </div>
    </div>
  );
}
