'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { VerificationQueueQueryT } from '@rentuz/contracts';
import { useVerificationQueue } from '@/hooks/use-admin';
import { VerificationReview } from '@/components/admin/VerificationReview';

const TABS = ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED'] as const;

/** §60 verification queue: tabs + list + keyboard-navigable review pane. */
export default function AdminVerificationPage() {
  const t = useTranslations('admin.verification');
  const tc = useTranslations('admin.common');
  const [status, setStatus] = useState<(typeof TABS)[number]>('PENDING');
  const [selected, setSelected] = useState<string | null>(null);
  const query: VerificationQueueQueryT = { status, limit: 20 };
  const { data, isPending, refetch } = useVerificationQueue(query);

  const items = data?.data ?? [];
  const selectedIndex = selected ? items.findIndex((item) => item.id === selected) : -1;

  const navigate = (direction: 'prev' | 'next') => {
    if (items.length === 0) return;
    const base = selectedIndex === -1 ? -1 : selectedIndex;
    const nextIndex =
      direction === 'next'
        ? (base + 1) % items.length
        : (base - 1 + items.length) % items.length;
    setSelected(items[nextIndex]?.id ?? null);
  };

  const onProcessed = () => {
    const next = items[Math.min(selectedIndex + 1, items.length - 1)]?.id ?? null;
    setSelected(next && next !== selected ? next : null);
    void refetch();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <div className="flex gap-1 rounded-[12px] border border-border bg-card p-1" data-testid="verification-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setStatus(tab);
              setSelected(null);
            }}
            className={`rounded-[8px] px-3 py-1.5 text-sm ${
              status === tab ? 'bg-primary font-medium text-black' : 'text-fg-secondary hover:text-fg'
            }`}
            data-testid={`verification-tab-${tab}`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
        <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
          <table className="w-full text-sm" data-testid="verification-table">
            <thead className="border-b border-border text-left text-xs uppercase text-fg-muted">
              <tr>
                <th className="px-3 py-3">E&apos;lon</th>
                <th className="px-3 py-3">Egasi</th>
                <th className="px-3 py-3">Holat</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-fg-muted">
                    {tc('loading')}
                  </td>
                </tr>
              ) : items.length ? (
                items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item.id)}
                    className={`cursor-pointer border-b border-border/50 hover:bg-elevated ${
                      selected === item.id ? 'bg-primary/10' : ''
                    }`}
                    data-testid={`verification-row-${item.id}`}
                  >
                    <td className="max-w-48 truncate px-3 py-3">{item.title}</td>
                    <td className="px-3 py-3 text-fg-secondary">{item.owner.name}</td>
                    <td className="px-3 py-3 text-xs text-fg-muted">
                      {item.claim ? t('claimedBy', { name: item.claim.adminName }) : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-fg-muted">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected ? (
          <VerificationReview propertyId={selected} onNavigate={navigate} onProcessed={onProcessed} />
        ) : (
          <p className="text-sm text-fg-muted">{t('empty')}</p>
        )}
      </div>
    </div>
  );
}
