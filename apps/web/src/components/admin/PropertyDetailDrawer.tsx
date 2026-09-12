'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@rentuz/ui';
import { useAdminProperty, useSetPropertyStatus } from '@/hooks/use-admin';
import { ConfirmModal } from './ConfirmModal';
import { formatDateTimeTak } from '@/lib/format';

type Action = { status: 'ACTIVE' | 'PAUSED' | 'REJECTED' | 'DELETED'; label: string; danger: boolean; reason: boolean };

/**
 * §59 property detail drawer: full listing + owner + status actions. Reject
 * requires a reason; pause/resume/delete are one click through ConfirmModal.
 */
export function PropertyDetailDrawer({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const t = useTranslations('admin.properties');
  const tc = useTranslations('admin.common');
  const { data: property, isPending } = useAdminProperty(propertyId);
  const setStatus = useSetPropertyStatus();
  const [action, setAction] = useState<Action | null>(null);

  const actions: Action[] = [
    { status: 'PAUSED', label: t('actions.pause'), danger: false, reason: false },
    { status: 'ACTIVE', label: t('actions.resume'), danger: false, reason: false },
    { status: 'REJECTED', label: t('actions.reject'), danger: false, reason: true },
    { status: 'DELETED', label: t('actions.delete'), danger: true, reason: false },
  ];

  const run = async (reason: string) => {
    if (!action) return;
    await setStatus.mutateAsync({
      propertyId,
      body: { status: action.status, ...(action.reason ? { reason } : {}) },
    });
    setAction(null);
  };

  const paused = property?.status === 'PAUSED';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-5"
        onClick={(event) => event.stopPropagation()}
        data-testid="property-detail-drawer"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{property?.title ?? '…'}</h2>
          <button type="button" onClick={onClose} className="text-sm text-fg-muted hover:text-fg">
            {tc('close')}
          </button>
        </div>

        {isPending || !property ? (
          <p className="text-sm text-fg-muted">{tc('loading')}</p>
        ) : (
          <div className="space-y-4">
            {property.images[0] ? (
              <img
                src={property.images[0].thumbUrl ?? property.images[0].url}
                alt=""
                className="h-48 w-full rounded-[12px] object-cover"
              />
            ) : null}

            <dl className="space-y-2 text-sm">
              <Row label={t('status')} value={<Badge>{t(`status_${property.status}`)}</Badge>} />
              {property.pausedReason ? (
                <Row label="Sabab" value={t(`pausedReason.${property.pausedReason}`)} />
              ) : null}
              <Row label={t('owner')} value={`${property.owner.name} · ${property.owner.phone}`} />
              <Row label="Manzil" value={property.address} />
              <Row label={t('views')} value={String(property.views)} />
              <Row label="Yaratilgan" value={formatDateTimeTak(property.createdAt)} />
            </dl>

            <p className="text-sm text-fg-secondary">{property.description.slice(0, 300)}</p>

            <div className="flex flex-wrap gap-2 pt-2">
              {actions
                .filter((item) => item.status !== property.status)
                .filter((item) => (item.status === 'ACTIVE' ? paused : true))
                .filter((item) => (item.status === 'PAUSED' ? property.status === 'ACTIVE' || property.status === 'RENTED' : true))
                .map((item) => (
                  <button
                    key={item.status}
                    type="button"
                    onClick={() => setAction(item)}
                    className={`h-10 rounded-[12px] px-4 text-sm font-medium ${
                      item.danger ? 'bg-error text-black' : 'border border-border text-fg-secondary hover:text-fg'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
            </div>
          </div>
        )}
      </aside>

      {action ? (
        <ConfirmModal
          open
          title={action.label}
          confirmLabel={action.label}
          danger={action.danger}
          reasonRequired={action.reason}
          busy={setStatus.isPending}
          onConfirm={(reason) => void run(reason)}
          onClose={() => setAction(null)}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
