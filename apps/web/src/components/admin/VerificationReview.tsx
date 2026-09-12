'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useClaimVerification, useVerificationAction, useVerificationDetail } from '@/hooks/use-admin';
import { PropertyGallery } from '@/components/property/PropertyGallery';
import { PropertyMiniMap } from '@/components/property/PropertyMiniMap';
import { ConfirmModal } from './ConfirmModal';
import { formatDateTimeTak, formatPriceUzs } from '@/lib/format';

const CHECKLIST_KEYS = [
  'locationMatches',
  'priceInRange',
  'imagesClear',
  'ownerVerifiable',
  'noDuplicates',
] as const;

/**
 * §60 verification review. Keyboard-driven: A approve, R reject, I request
 * info, ←/→ navigate the queue. The 5-point checklist must be confirmed
 * before approving; reject + request-info are mandatory-reason modals.
 */
export function VerificationReview({
  propertyId,
  onNavigate,
  onProcessed,
}: {
  propertyId: string;
  onNavigate: (direction: 'prev' | 'next') => void;
  onProcessed: () => void;
}) {
  const t = useTranslations('admin.verification');
  const tc = useTranslations('admin.common');
  const { data: detail, isPending } = useVerificationDetail(propertyId);
  const claim = useClaimVerification();
  const action = useVerificationAction();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<'reject' | 'request-info' | null>(null);

  useEffect(() => {
    setChecked({});
  }, [propertyId]);

  const allChecked = useMemo(() => CHECKLIST_KEYS.every((key) => checked[key]), [checked]);

  const runAction = useCallback(
    async (kind: 'approve' | 'reject' | 'request-info', body?: { reason?: string; message?: string }) => {
      await action.mutateAsync({ propertyId, action: kind, body });
      setModal(null);
      onProcessed();
    },
    [action, propertyId, onProcessed],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'a' || event.key === 'A') {
        if (allChecked) void runAction('approve');
      } else if (event.key === 'r' || event.key === 'R') {
        setModal('reject');
      } else if (event.key === 'i' || event.key === 'I') {
        setModal('request-info');
      } else if (event.key === 'ArrowLeft') {
        onNavigate('prev');
      } else if (event.key === 'ArrowRight') {
        onNavigate('next');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allChecked, onNavigate, runAction]);

  if (isPending || !detail) {
    return <p className="text-sm text-fg-muted">{tc('loading')}</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]" data-testid="verification-review">
      <div className="space-y-4">
        <PropertyGallery
          images={detail.images.map((img) => ({ id: img.id, url: img.url, width: img.width, height: img.height }))}
          title={detail.title}
        />
        <section className="rounded-[12px] border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{detail.title}</h2>
          <p className="mt-1 text-sm text-fg-secondary">{detail.description}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Field label="Manzil" value={detail.address} />
            <Field label={t('priceSnapshot')} value={formatPriceUzs(detail.priceUzs)} />
            <Field label="Xonalar" value={`${detail.rooms} / ${detail.bedrooms} / ${detail.bathrooms}`} />
            <Field label="Maydon" value={`${detail.area} m²`} />
            <Field label="Region" value={detail.regionName ?? '—'} />
            <Field label="Tuman" value={detail.districtName ?? '—'} />
          </dl>
        </section>
        {typeof detail.lat === 'number' && typeof detail.lng === 'number' ? (
          <PropertyMiniMap lng={detail.lng} lat={detail.lat} label={detail.address} />
        ) : null}
      </div>

      <div className="space-y-4">
        <section className="rounded-[12px] border border-border bg-card p-4" data-testid="owner-card">
          <h2 className="text-sm font-semibold">{t('ownerCard')}</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <Field label="Ism" value={detail.ownerCard.name} />
            <Field label="Telefon" value={detail.ownerCard.phone} />
            <Field label={t('memberSince')} value={formatDateTimeTak(detail.ownerCard.memberSince)} />
            <Field label={t('totalListings')} value={String(detail.ownerCard.totalListings)} />
            <Field
              label={t('priorViolations')}
              value={String(detail.ownerCard.priorViolations)}
            />
          </dl>
          {detail.claim ? (
            <p className="mt-2 text-xs text-primary">
              {t('claimedBy', { name: detail.claim.adminName })}
            </p>
          ) : null}
        </section>

        <section className="rounded-[12px] border border-border bg-card p-4" data-testid="checklist">
          <h2 className="text-sm font-semibold">{t('checklistTitle')}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {CHECKLIST_KEYS.map((key) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!checked[key]}
                    onChange={(event) => setChecked((c) => ({ ...c, [key]: event.target.checked }))}
                    data-testid={`checklist-${key}`}
                  />
                  {t(`checklist.${key}`)}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-fg-muted">{t('shortcuts')}</p>
        </section>

        <div className="flex flex-wrap gap-2">
          {!detail.claim ? (
            <button
              type="button"
              onClick={() => void claim.mutateAsync(propertyId)}
              className="h-10 rounded-[12px] border border-border px-4 text-sm text-fg-secondary hover:text-fg"
            >
              {t('claim')}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!allChecked || action.isPending}
            onClick={() => void runAction('approve')}
            className="h-10 rounded-[12px] bg-success px-4 text-sm font-medium text-white disabled:opacity-50"
            data-testid="verification-approve"
          >
            {t('approve')}
          </button>
          <button
            type="button"
            onClick={() => setModal('reject')}
            className="h-10 rounded-[12px] bg-error px-4 text-sm font-medium text-black"
            data-testid="verification-reject"
          >
            {t('reject')}
          </button>
          <button
            type="button"
            onClick={() => setModal('request-info')}
            className="h-10 rounded-[12px] border border-border px-4 text-sm text-fg-secondary hover:text-fg"
            data-testid="verification-request-info"
          >
            {t('requestInfo')}
          </button>
        </div>
        {!allChecked ? <p className="text-xs text-fg-muted">{t('checklistRequired')}</p> : null}
      </div>

      <ConfirmModal
        open={modal !== null}
        title={modal === 'request-info' ? t('requestInfo') : t('reject')}
        confirmLabel={modal === 'request-info' ? t('requestInfo') : t('reject')}
        danger={modal === 'reject'}
        reasonRequired
        reasonLabel={modal === 'request-info' ? tc('messageLabel') : tc('reasonLabel')}
        busy={action.isPending}
        onConfirm={(value) =>
          void runAction(modal === 'request-info' ? 'request-info' : 'reject', {
            ...(modal === 'request-info' ? { message: value } : { reason: value }),
          })
        }
        onClose={() => setModal(null)}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}
