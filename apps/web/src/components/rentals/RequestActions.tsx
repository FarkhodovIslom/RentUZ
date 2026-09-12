'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

/**
 * §1.3 items 16–17 — owner accept/reject with a confirm step (accept cannot
 * be undone: the property flips to RENTED and competitors are auto-rejected).
 * router.refresh() re-renders the server-rendered list without a full page
 * load (a hard reload raced the toast in E2E).
 */
export function RequestActions({ requestId, status }: { requestId: string; status: string }) {
  const [busy, setBusy] = useState<'ACCEPTED' | 'REJECTED' | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  if (status !== 'PENDING') return null;

  const decide = async (next: 'ACCEPTED' | 'REJECTED') => {
    if (next === 'ACCEPTED' && !window.confirm("Qabul qilish qaytarib bo'lmaydi — e'lon ijarga beriladi va boshqa so'rovlar rad etiladi. Davom etamizmi?")) {
      return;
    }
    setBusy(next);
    try {
      await api.patch(`/rental-requests/${requestId}`, { status: next });
      toast(next === 'ACCEPTED' ? 'So\'rov qabul qilindi' : "So'rov rad etildi");
      void queryClient.invalidateQueries({ queryKey: ['requests-list'] });
      void queryClient.invalidateQueries({ queryKey: ['requests-count'] });
      // Phase 6 §1.3 item 15 — dashboard/analytics tiles read these keys.
      void queryClient.invalidateQueries({ queryKey: ['owner', 'requests'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics', 'overview'] });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROPERTY_NOT_AVAILABLE') {
        toast("E'lon allaqachon ijarga berilgan");
        router.refresh();
      } else {
        toast('Xatolik — qayta urinib ko‘ring');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => decide('ACCEPTED')}
        disabled={busy !== null}
        className="inline-flex h-9 items-center rounded-[10px] bg-primary px-3 text-xs font-semibold text-black hover:bg-primary-hover disabled:opacity-60"
      >
        {busy === 'ACCEPTED' ? '...' : 'Qabul qilish'}
      </button>
      <button
        type="button"
        onClick={() => decide('REJECTED')}
        disabled={busy !== null}
        className="inline-flex h-9 items-center rounded-[10px] border border-border px-3 text-xs font-medium text-fg-secondary hover:border-error hover:text-error disabled:opacity-60"
      >
        {busy === 'REJECTED' ? '...' : 'Rad etish'}
      </button>
    </div>
  );
}
