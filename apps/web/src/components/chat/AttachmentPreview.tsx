'use client';

import { useAttachmentUrl } from '@/hooks/use-attachment-url';

/** §94 attachment thumbnail — signed URL minted lazily on mount. */
export function AttachmentPreview({ conversationId, attachmentKey }: { conversationId: string; attachmentKey: string }) {
  const { data, isLoading } = useAttachmentUrl(conversationId, attachmentKey);
  return (
    <span className="block max-w-[220px] overflow-hidden rounded-[12px] border border-border">
      {isLoading || !data ? (
        <span className="flex h-28 w-44 items-center justify-center bg-elevated text-xs text-fg-muted">
          Rasm yuklanmoqda…
        </span>
      ) : (
        // Plain <img> matches the app-wide convention (remotePatterns via
        // plain tags; next/image is not used anywhere in the codebase).
        <img src={data.url} alt="Chatdagi rasm" className="block h-auto w-full" loading="lazy" />
      )}
    </span>
  );
}
