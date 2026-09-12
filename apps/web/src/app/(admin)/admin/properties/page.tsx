'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminPropertiesListQueryT } from '@rentuz/contracts';
import { useAdminProperties } from '@/hooks/use-admin';
import { PropertyDetailDrawer } from '@/components/admin/PropertyDetailDrawer';

/** §59 property browser: search + type/status/verification filters + drawer. */
export default function AdminPropertiesPage() {
  const t = useTranslations('admin.properties');
  const tc = useTranslations('admin.common');
  const [query, setQuery] = useState<AdminPropertiesListQueryT>({ limit: 20 });
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isPending } = useAdminProperties(query);

  const statuses = [
    'DRAFT',
    'PENDING_VERIFICATION',
    'ACTIVE',
    'PAUSED',
    'RENTED',
    'REJECTED',
    'DELETED',
  ] as const;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <div className="flex flex-wrap items-end gap-2" data-testid="properties-filters">
        <input
          value={query.search ?? ''}
          onChange={(event) => setQuery((q) => ({ ...q, search: event.target.value || undefined }))}
          placeholder={t('search')}
          className="h-10 min-w-56 flex-1 rounded-[10px] border border-border bg-input px-3 text-sm"
        />
        <select
          value={query.status ?? ''}
          onChange={(event) => setQuery((q) => ({ ...q, status: (event.target.value || undefined) as AdminPropertiesListQueryT['status'] }))}
          className="h-10 rounded-[10px] border border-border bg-input px-3 text-sm"
          aria-label={t('status')}
        >
          <option value="">{t('status')}</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {t(`status_${status}`)}
            </option>
          ))}
        </select>
        <select
          value={query.verification ?? ''}
          onChange={(event) =>
            setQuery((q) => ({ ...q, verification: (event.target.value || undefined) as AdminPropertiesListQueryT['verification'] }))
          }
          className="h-10 rounded-[10px] border border-border bg-input px-3 text-sm"
          aria-label={t('verification')}
        >
          <option value="">{t('verification')}</option>
          <option value="VERIFIED">Tasdiqlangan</option>
          <option value="UNVERIFIED">Tasdiqlanmagan</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
        <table className="w-full text-sm" data-testid="properties-table">
          <thead className="border-b border-border text-left text-xs uppercase text-fg-muted">
            <tr>
              <th className="px-4 py-3">Sarlavha</th>
              <th className="px-4 py-3">{t('owner')}</th>
              <th className="px-4 py-3">{t('status')}</th>
              <th className="px-4 py-3">{t('views')}</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-fg-muted">
                  {tc('loading')}
                </td>
              </tr>
            ) : data?.data.length ? (
              data.data.map((property) => (
                <tr
                  key={property.id}
                  onClick={() => setSelected(property.id)}
                  className="cursor-pointer border-b border-border/50 hover:bg-elevated"
                >
                  <td className="max-w-64 truncate px-4 py-3">{property.title}</td>
                  <td className="px-4 py-3 text-fg-secondary">{property.owner.name}</td>
                  <td className="px-4 py-3">{t(`status_${property.status}`)}</td>
                  <td className="px-4 py-3">{property.views}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-fg-muted">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.meta.hasMore && data.meta.nextCursor ? (
        <button
          type="button"
          onClick={() => setQuery((q) => ({ ...q, cursor: data.meta.nextCursor ?? undefined }))}
          className="h-10 rounded-[12px] border border-border px-4 text-sm text-fg-secondary hover:text-fg"
        >
          {tc('loading')}
        </button>
      ) : null}

      {selected ? <PropertyDetailDrawer propertyId={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
