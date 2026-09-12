'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AttachmentMetaT } from '@rentuz/contracts';
import { toast } from '../ui/Toaster';

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * §94 attachment picker — click / drag-drop / paste; uploads immediately to
 * the conversation's private-bucket endpoint and hands back AttachmentMeta.
 * Server-side magic-byte sniffing is the authority; the client filter is UX.
 */
export function AttachmentUpload({
  conversationId,
  onUploaded,
  disabled = false,
}: {
  conversationId: string;
  onUploaded: (meta: AttachmentMetaT) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('chat');
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: File[]) => {
    const valid = files.filter(
      (f) => ACCEPTED.includes(f.type) && f.size <= MAX_FILE_SIZE_BYTES,
    );
    if (valid.length === 0) {
      toast(t('attachment.invalid'));
      return;
    }
    setUploading(true);
    try {
      for (const file of valid.slice(0, MAX_FILES)) {
        const form = new FormData();
        form.append('files', file);
        const response = await fetch(`/api/v1/conversations/${conversationId}/attachments`, {
          method: 'POST',
          body: form,
          credentials: 'same-origin',
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          toast(payload?.message ?? t('attachment.failed'));
          return;
        }
        const payload = (await response.json()) as { data: AttachmentMetaT[] };
        for (const meta of payload.data) onUploaded(meta);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void upload(files);
        }}
      />
      <button
        type="button"
        aria-label={t('attachment.label')}
        title={t('attachment.label')}
        disabled={uploading || disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length > 0) void upload(files);
        }}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-border text-lg text-fg-secondary hover:bg-elevated disabled:opacity-50"
      >
        {uploading ? '…' : '📷'}
      </button>
    </>
  );
}
