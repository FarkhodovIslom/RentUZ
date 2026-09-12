'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ReportListQueryT, ReportPriorityT } from '@rentuz/contracts';
import { Badge, type BadgeVariant } from '@rentuz/ui';
import { useAdminReports } from '@/hooks/use-admin';
import { ReportReview } from '@/components/admin/ReportReview';

const PRIORITY_VARIANT: Record<ReportPriorityT, BadgeVariant> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'primary',
  CRITICAL: 'error',
};

/** §61 moderation queue: priority/status filters + report review drawer. */
export default function AdminReportsPage() {
  const t = useTranslations('admin.reports');
  const tc = useTranslations('admin.common');
  const [query, setQuery] = useState<ReportListQueryT>({ limit: 20 });
  const { data, isPending } = useAdminReports(query);
  const [selected, setSelected] = useState<string | null>(null);

  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
  const statuses = ['OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED'] as const;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <div className="flex flex-wrap items-end gap-2" data-testid="reports-filters">
        <select
          value={query.priority ?? ''}
          onChange={(event) => setQuery((q) => ({ ...q, priority: (event.target.value || undefined) as ReportPriorityT | undefined }))}
          className="h-10 rounded-[10px] border border-border bg-input px-3 text-sm"
          aria-label={t('priority')}
        >
          <option value="">{t('priority')}</option>
          {priorities.map((priority) => (
            <option key={priority} value={priority}>
              {t(`priority_${priority}`)}
            </option>
          ))}
        </select>
        <select
          value={query.status ?? ''}
          onChange={(event) => setQuery((q) => ({ ...q, status: (event.target.value || undefined) as ReportListQueryT['status'] }))}
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
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
        <table className="w-full text-sm" data-testid="reports-table">
          <thead className="border-b border-border text-left text-xs uppercase text-fg-muted">
            <tr>
              <th className="px-4 py-3">{t('reason')}</th>
              <th className="px-4 py-3">{t('targetType')}</th>
              <th className="px-4 py-3">{t('priority')}</th>
              <th className="px-4 py-3">{t('status')}</th>
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
              data.data.map((report) => (
                <tr
                  key={report.id}
                  onClick={() => setSelected(report.id)}
                  className="cursor-pointer border-b border-border/50 hover:bg-elevated"
                  data-testid={`report-row-${report.id}`}
                >
                  <td className="px-4 py-3">{t(`reasons.${report.reason}`)}</td>
                  <td className="px-4 py-3 text-fg-secondary">{t(`targetType_${report.targetType}`)}</td>
                  <td className="px-4 py-3">
                    <span data-testid={`priority-${report.id}`}>
                      <Badge variant={PRIORITY_VARIANT[report.priority]}>
                        {t(`priority_${report.priority}`)}
                      </Badge>
                    </span>
                  </td>
                  <td className="px-4 py-3">{t(`status_${report.status}`)}</td>
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

      {selected && data?.data.find((report) => report.id === selected) ? (
        <ReportReview
          report={data.data.find((report) => report.id === selected)!}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
