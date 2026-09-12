'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminRequestsListQueryT } from '@rentuz/contracts';
import { useAdminRequests } from '@/hooks/use-admin';
import { formatDateTimeTak } from '@/lib/format';

const STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED'] as const;

/** §15 /admin/requests — read-only browser over all rental requests. */
export default function AdminRequestsPage() {
  const t = useTranslations('admin.requests');
  const tc = useTranslations('admin.common');
  const [query, setQuery] = useState<AdminRequestsListQueryT>({ limit: 20 });
  const { data, isPending } = useAdminRequests(query);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] uppercase text-fg-muted">
          {t('readOnly')}
        </span>
      </div>

      <select
        value={query.status ?? ''}
        onChange={(event) => setQuery((q) => ({ ...q, status: (event.target.value || undefined) as AdminRequestsListQueryT['status'] }))}
        className="h-10 rounded-[10px] border border-border bg-input px-3 text-sm"
        aria-label="status"
        data-testid="requests-status-filter"
      >
        <option value="">Barcha holatlar</option>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>

      <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
        <table className="w-full text-sm" data-testid="requests-table">
          <thead className="border-b border-border text-left text-xs uppercase text-fg-muted">
            <tr>
              <th className="px-4 py-3">{t('property')}</th>
              <th className="px-4 py-3">{t('tenant')}</th>
              <th className="px-4 py-3">{t('owner')}</th>
              <th className="px-4 py-3">{t('duration')}</th>
              <th className="px-4 py-3">Holat</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-fg-muted">
                  {tc('loading')}
                </td>
              </tr>
            ) : data?.data.length ? (
              data.data.map((row) => (
                <tr key={row.id} className="border-b border-border/50">
                  <td className="max-w-48 truncate px-4 py-3">{row.property.title}</td>
                  <td className="px-4 py-3 text-fg-secondary">{row.tenant.name}</td>
                  <td className="px-4 py-3 text-fg-secondary">{row.owner.name}</td>
                  <td className="px-4 py-3">
                    {row.durationMonths} oy · {formatDateTimeTak(row.startDate)}
                  </td>
                  <td className="px-4 py-3">{row.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-fg-muted">
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
    </div>
  );
}
