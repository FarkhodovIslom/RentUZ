'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

/**
 * §1.3 — tenant cancels their own PENDING request from the list. Simple
 * confirm() flow (the PATCH 403s server-side if anything races).
 */
export function CancelRequestButton({ requestId }: { requestId: string }) {
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const cancel = async () => {
    if (!window.confirm("So'rovni bekor qilasizmi?")) return;
    setBusy(true);
    try {
      await api.patch(`/rental-requests/${requestId}`, { status: 'CANCELLED' });
      toast("So'rov bekor qilindi");
      void queryClient.invalidateQueries({ queryKey: ['requests-list'] });
      void queryClient.invalidateQueries({ queryKey: ['requests-count'] });
      window.location.reload(); // RSC list — refresh server-rendered rows
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROPERTY_NOT_AVAILABLE') {
        toast('So\'rov allaqachon ko\'rib chiqilgan');
        window.location.reload();
      } else {
        toast('Xatolik — qayta urinib ko‘ring');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={cancel}
      disabled={busy}
      className="inline-flex h-8 items-center rounded-[10px] border border-border px-3 text-xs font-medium text-fg-secondary hover:border-error hover:text-error disabled:opacity-60"
    >
      Bekor qilish
    </button>
  );
}
