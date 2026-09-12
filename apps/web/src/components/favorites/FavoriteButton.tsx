'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';
import {
  FAVORITE_IDS_KEY,
  PENDING_FAVORITE_KEY,
  invalidateFavorites,
  useFavoriteIds,
} from './useFavorites';

interface FavoriteButtonProps {
  propertyId: string;
  variant?: 'card' | 'detail';
}

/**
 * §19/§22 heart — optimistic toggle via React Query, yellow when active.
 * Anonymous click stores the intent and redirects to login (`next` param);
 * after the login round trip the pending favorite replays automatically.
 */
export function FavoriteButton({ propertyId, variant = 'card' }: FavoriteButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const idsQuery = useFavoriteIds();
  const isFavorite = idsQuery.data?.has(propertyId) ?? false;
  const replayProbed = useRef(false);

  // Replay a pending favorite after the login round trip. The favorites
  // query still holds the anonymous `null` — re-probe once with fresh
  // cookies, then POST if the property isn't favorited yet.
  useEffect(() => {
    const pending = window.sessionStorage.getItem(PENDING_FAVORITE_KEY);
    if (!pending || pending !== propertyId) return;
    if (idsQuery.isFetching) return;
    if (idsQuery.data == null) {
      if (replayProbed.current) return; // re-probed and still anonymous
      replayProbed.current = true;
      void idsQuery.refetch();
      return;
    }
    window.sessionStorage.removeItem(PENDING_FAVORITE_KEY);
    if (!idsQuery.data.has(propertyId)) {
      void api
        .post(`/favorites/${propertyId}`)
        .then(() => {
          invalidateFavorites(queryClient);
          toast('Saqlandi');
        })
        .catch(() => undefined);
    }
  }, [propertyId, idsQuery, queryClient]);

  const mutation = useMutation({
    // The toggle intent is captured at mutate() time: the optimistic update
    // flips `isFavorite` before onSuccess fires, so reading it there would
    // show the "removed" toast for a successful add.
    mutationFn: async (wasFavorite: boolean) => {
      if (wasFavorite) await api.del(`/favorites/${propertyId}`);
      else await api.post(`/favorites/${propertyId}`);
    },
    onMutate: (wasFavorite) => {
      const previous = queryClient.getQueryData<Set<string> | null>(FAVORITE_IDS_KEY);
      queryClient.setQueryData<Set<string> | null>(FAVORITE_IDS_KEY, (old) => {
        if (!old) return old;
        const next = new Set(old);
        if (wasFavorite) next.delete(propertyId);
        else next.add(propertyId);
        return next;
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(FAVORITE_IDS_KEY, context?.previous);
      if (error instanceof ApiError && error.status === 401) {
        window.sessionStorage.setItem(PENDING_FAVORITE_KEY, propertyId);
        router.push(`/login?next=${encodeURIComponent(pathname ?? '/')}`);
        return;
      }
      toast('Xatolik — qayta urinib ko‘ring');
    },
    onSuccess: (_data, wasFavorite) => {
      invalidateFavorites(queryClient);
      toast(wasFavorite ? 'Saqlanganlardan olib tashlandi' : 'Saqlandi');
    },
  });

  const label = isFavorite ? 'Saqlanganlardan olib tashlash' : 'Saqlash';

  if (variant === 'detail') {
    return (
      <button
        type="button"
        aria-pressed={isFavorite}
        // No aria-label: the visible text is the accessible name. An
        // aria-label ("Saqlanganlardan olib tashlash") would override it and
        // hide the short "Saqlash"/"Saqlangan" state label from AT.
        onClick={() => mutation.mutate(isFavorite)}
        disabled={mutation.isPending}
        className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-border bg-card px-4 text-sm font-medium hover:border-primary disabled:opacity-60"
      >
        <Heart filled={isFavorite} className="h-5 w-5" />
        {isFavorite ? 'Saqlangan' : 'Saqlash'}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={isFavorite}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate(isFavorite);
      }}
      disabled={mutation.isPending}
      className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-bg/80 backdrop-blur transition-colors hover:bg-bg disabled:opacity-60"
    >
      <Heart filled={isFavorite} className="h-5 w-5" />
    </button>
  );
}

function Heart({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'var(--color-primary)' : 'none'}
      stroke={filled ? 'var(--color-primary)' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
