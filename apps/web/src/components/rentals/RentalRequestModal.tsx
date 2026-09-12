'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CreateRentalRequestInput, type CreateRentalRequestInputT } from '@rentuz/contracts';
import type { z } from 'zod';
import { Button, Input, Textarea } from '@rentuz/ui';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/Toaster';

const REQUESTS_LIST_KEY = ['requests-list'];
const REQUESTS_COUNT_KEY = ['requests-count'];

function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

interface RentalRequestModalProps {
  propertyId: string;
  price: number;
  currency: 'UZS' | 'USD';
  /** 'compact' renders a small opener button (mobile CTA bar). */
  variant?: 'full' | 'compact';
}

/**
 * §1.3 item 13 — "Ijara so'rovi" modal. RHF + Zod (contract schema), frozen
 * price preview (§25), success / duplicate / unavailable states. Anonymous
 * submit gets the same login hand-off as FavoriteButton (no replay — the
 * form needs fresh input after login).
 */
export function RentalRequestModal({
  propertyId,
  price,
  currency,
  variant = 'full',
}: RentalRequestModalProps) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  // z.coerce.date() makes the zod *input* shape `unknown` for startDate —
  // RHF's first generic must match the schema input, the third the output.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof CreateRentalRequestInput>, unknown, CreateRentalRequestInputT>({
    resolver: zodResolver(CreateRentalRequestInput),
    defaultValues: { propertyId, startDate: undefined, durationMonths: 12, message: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/rental-requests', { ...values, propertyId });
      setSent(true);
      toast("So'rov yuborildi");
      void queryClient.invalidateQueries({ queryKey: REQUESTS_LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: REQUESTS_COUNT_KEY });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname ?? '/')}`);
        return;
      }
      if (error instanceof ApiError && error.code === 'DUPLICATE_PENDING_REQUEST') {
        setSent(true); // treat as success-adjacent: the request is already pending
        toast('So\'rovingiz ko\'rib chiqilmoqda');
        return;
      }
      if (error instanceof ApiError && error.code === 'PROPERTY_NOT_AVAILABLE') {
        toast('E\'lon ijaraga berilgan');
        setOpen(false);
        return;
      }
      toast('Xatolik — qayta urinib ko‘ring');
    }
  });

  const opener =
    variant === 'compact' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center rounded-[12px] border border-border px-3 text-sm font-medium"
      >
        So&apos;rov
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 flex-1 items-center justify-center rounded-[12px] border border-border px-4 text-sm font-medium hover:border-primary"
      >
        Ijara so&apos;rovi
      </button>
    );

  if (sent) {
    return (
      <p
        role="status"
        className={
          variant === 'compact'
            ? 'text-xs text-success'
            : 'rounded-[12px] border border-success/40 bg-success/10 p-3 text-sm text-success'
        }
      >
        So&apos;rov yuborildi — owner tez orada bog&apos;lanadi
      </p>
    );
  }

  return (
    <>
      {opener}
      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Yopish"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ijara so'rovi"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[18px] border-t border-border bg-bg p-4 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none md:border-l md:border-t-0"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold">Ijara so&apos;rovi</h2>
              <button
                type="button"
                aria-label="Yopish"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-elevated"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* §25 frozen price preview */}
            <p className="mb-4 rounded-[12px] bg-elevated px-3 py-2 text-sm">
              E&apos;lon narxi:{' '}
              <span className="font-bold text-primary">
                {new Intl.NumberFormat('uz-UZ').format(price)} {currency}
              </span>{' '}
              / oy — yakuniy narx owner qabul qilgan shartlarda
            </p>

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Textarea
                id="request-message"
                label="Xabar (kamida 20 belgi)"
                error={errors.message?.message}
                rows={4}
                {...register('message')}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="request-start-date"
                  type="date"
                  label="Boshlanish sanasi"
                  min={isoDay(0)}
                  max={isoDay(90)}
                  error={errors.startDate?.message}
                  {...register('startDate')}
                />
                <Input
                  id="request-duration"
                  type="number"
                  label="Davomiylik (oy)"
                  min={1}
                  max={36}
                  error={errors.durationMonths?.message}
                  {...register('durationMonths', { valueAsNumber: true })}
                />
              </div>

              <Button type="submit" className="w-full" loading={isSubmitting}>
                {isSubmitting ? 'Yuborilmoqda...' : 'Yuborish'}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
