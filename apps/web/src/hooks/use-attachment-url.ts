'use client';

import { useQuery } from '@tanstack/react-query';
import type { SignedUrlResponseT } from '@rentuz/contracts';
import { api } from '@/lib/api';

/**
 * §94 lazy signed URL — minted on demand, cached ~9 min (URL lives 600 s).
 * Falls back to a placeholder when the mint fails.
 */
export function useAttachmentUrl(conversationId: string | null, key: string | null) {
  return useQuery({
    queryKey: ['attachment-url', key],
    queryFn: () =>
      api.get<SignedUrlResponseT>(
        `/conversations/${conversationId}/attachments/url?key=${encodeURIComponent(key ?? '')}`,
      ),
    enabled: conversationId !== null && key !== null,
    staleTime: 9 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}
