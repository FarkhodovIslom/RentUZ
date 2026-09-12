'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AttachmentMetaT } from '@rentuz/contracts';
import { getSocket } from '@/lib/socket-client';
import { useChatStore } from '@/stores/chat.store';
import { toast } from '../ui/Toaster';
import { AttachmentUpload } from './AttachmentUpload';

const TYPING_STOP_DELAY_MS = 3000;

/**
 * §27 composer — text + attachments; typing:start/stop throttled; sends ride
 * the socket (message:send ack resolves the optimistic row).
 */
export function Composer({ conversationId, disabled = false }: { conversationId: string; disabled?: boolean }) {
  const t = useTranslations('chat');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentMetaT[]>([]);
  const [sending, setSending] = useState(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);
  const socket = getSocket();
  const setDraft = useChatStore((s) => s.setDraft);
  const clearDraft = useChatStore((s) => s.clearDraft);

  const emitTyping = (typing: boolean) => {
    socket.emit(typing ? 'typing:start' : 'typing:stop', { conversationId }, () => undefined);
  };

  const onTextChange = (value: string) => {
    setText(value);
    setDraft(conversationId, value);
    if (!typingActive.current) {
      typingActive.current = true;
      emitTyping(true);
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      typingActive.current = false;
      emitTyping(false);
    }, TYPING_STOP_DELAY_MS);
  };

  const send = async () => {
    const trimmed = text.trim();
    if (sending || disabled || (!trimmed && attachments.length === 0)) return;
    setSending(true);
    try {
      const ack = await new Promise<{ ok: boolean; error?: { message?: string } }>((resolve) => {
        const failTimer = setTimeout(
          () => resolve({ ok: false, error: { message: "Yuborishmadi — qayta urinib ko'ring" } }),
          10_000,
        );
        socket.emit(
          'message:send',
          {
            conversationId,
            ...(trimmed ? { text: trimmed } : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
          },
          (response: { ok: boolean; error?: { message?: string } }) => {
            clearTimeout(failTimer);
            resolve(response);
          },
        );
      });
      if (!ack.ok) {
        toast(ack.error?.message ?? t('sendFailed'));
        return;
      }
      setText('');
      setAttachments([]);
      clearDraft(conversationId);
      emitTyping(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-border bg-card p-3">
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.key}
              className="flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 py-1 text-xs"
            >
              📷 {t('attachment.label')}
              <button
                type="button"
                aria-label="O'chirish"
                onClick={() => setAttachments((current) => current.filter((x) => x.key !== a.key))}
                className="text-fg-muted hover:text-fg"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <AttachmentUpload
          conversationId={conversationId}
          onUploaded={(meta) => setAttachments((current) => [...current, meta])}
          disabled={disabled}
        />
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            // Chat convention: Enter sends, Shift+Enter inserts a newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t('placeholder')}
          rows={1}
          maxLength={2000}
          disabled={disabled}
          className="max-h-32 min-h-11 flex-1 resize-y rounded-[12px] border border-border bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || disabled || (!text.trim() && attachments.length === 0)}
          className="inline-flex h-11 min-h-11 items-center rounded-[12px] bg-primary px-4 text-sm font-medium text-black hover:bg-primary-hover disabled:opacity-50"
        >
          {sending ? '…' : t('send')}
        </button>
      </form>
    </div>
  );
}
