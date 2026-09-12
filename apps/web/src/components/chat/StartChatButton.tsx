'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ConversationDTOT } from '@rentuz/contracts';
import { ApiError, api } from '@/lib/api';
import { toast } from '../ui/Toaster';

/**
 * §27 entry point — creates (idempotently) or reuses the conversation for a
 * property and deep-links /chat?c=. 401 routes to login with a ?next return
 * (RentalRequestModal precedent); self-chat is gated server-side with
 * CANNOT_CHAT_SELF (public DTOs deliberately omit ownerId).
 */
export function StartChatButton({
  propertyId,
  variant = 'full',
}: {
  propertyId: string;
  variant?: 'full' | 'compact';
}) {
  const t = useTranslations('chat');
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      const conversation = await api.post<ConversationDTOT>('/conversations', { propertyId });
      router.push(`/chat?c=${conversation.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (error instanceof ApiError && error.code === 'CANNOT_CHAT_SELF') {
        toast(t('ownListing'));
        return;
      }
      toast(error instanceof ApiError ? error.message : t('sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  const base =
    variant === 'compact'
      ? 'inline-flex h-10 flex-1 items-center justify-center rounded-[12px] bg-primary px-4 text-sm font-semibold text-black hover:bg-primary-hover disabled:opacity-60'
      : 'inline-flex h-11 flex-1 items-center justify-center rounded-[12px] bg-primary px-4 text-sm font-semibold text-black hover:bg-primary-hover disabled:opacity-60';

  return (
    <button type="button" onClick={() => void start()} disabled={loading} className={base}>
      {loading ? '…' : t('startChat')}
    </button>
  );
}
