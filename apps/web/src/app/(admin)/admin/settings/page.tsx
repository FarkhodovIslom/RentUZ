'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AuditListQueryT } from '@rentuz/contracts';
import { Badge } from '@rentuz/ui';
import { useAuditLog, useFeatureFlags, useJobs, useUpdateFeatureFlags } from '@/hooks/use-admin';
import { formatDateTimeTak } from '@/lib/format';

const TABS = ['flags', 'audit', 'jobs'] as const;

/** §15 /admin/settings — runtime feature flags, audit log, BullMQ job runs. */
export default function AdminSettingsPage() {
  const t = useTranslations('admin.settings');
  const [tab, setTab] = useState<(typeof TABS)[number]>('flags');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <div className="flex gap-1 rounded-[12px] border border-border bg-card p-1" data-testid="settings-tabs">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-[8px] px-3 py-1.5 text-sm ${
              tab === item ? 'bg-primary font-medium text-black' : 'text-fg-secondary hover:text-fg'
            }`}
            data-testid={`settings-tab-${item}`}
          >
            {t(`tabs.${item}`)}
          </button>
        ))}
      </div>

      {tab === 'flags' ? <FlagsTab /> : null}
      {tab === 'audit' ? <AuditTab /> : null}
      {tab === 'jobs' ? <JobsTab /> : null}
    </div>
  );
}

function FlagsTab() {
  const t = useTranslations('admin.settings.flags');
  const { data, isPending } = useFeatureFlags();
  const update = useUpdateFeatureFlags();
  const [draft, setDraft] = useState<Record<string, boolean | number>>({});

  if (isPending || !data) return <p className="text-sm text-fg-muted">…</p>;

  return (
    <section className="space-y-3">
      <p className="text-sm text-fg-secondary">{t('description')}</p>
      <p className="rounded-[10px] border border-primary/40 bg-primary/10 p-2 text-xs text-primary">
        {t('productionWarning')}
      </p>
      <ul className="space-y-2" data-testid="flags-list">
        {data.flags.map((flag) => {
          const value = draft[flag.name] ?? flag.value;
          const changed = draft[flag.name] !== undefined && draft[flag.name] !== flag.value;
          return (
            <li
              key={flag.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-card p-3"
              data-testid={`flag-${flag.name}`}
            >
              <div>
                <p className="text-sm">{t(flag.name)}</p>
                <p className="text-xs text-fg-muted">
                  {t(`source_${flag.source}`)} · {String(flag.value)}
                  {flag.productionLocked ? ' · prod: false' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {typeof flag.value === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) => setDraft((d) => ({ ...d, [flag.name]: event.target.checked }))}
                    data-testid={`flag-input-${flag.name}`}
                  />
                ) : (
                  <input
                    type="number"
                    value={Number(value)}
                    min={1}
                    onChange={(event) => setDraft((d) => ({ ...d, [flag.name]: Number(event.target.value) }))}
                    className="h-9 w-24 rounded-[8px] border border-border bg-input px-2 text-sm"
                    data-testid={`flag-input-${flag.name}`}
                  />
                )}
                {changed ? (
                  <button
                    type="button"
                    onClick={() => void update.mutateAsync({ [flag.name]: value })}
                    disabled={update.isPending}
                    className="h-9 rounded-[10px] bg-primary px-3 text-sm font-medium text-black"
                    data-testid={`flag-save-${flag.name}`}
                  >
                    {t('save')}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AuditTab() {
  const t = useTranslations('admin.settings.audit');
  const ta = useTranslations('admin.audit.actions');
  const [query, setQuery] = useState<AuditListQueryT>({ limit: 20 });
  const { data, isPending } = useAuditLog(query);

  return (
    <section className="space-y-3">
      <p className="text-sm text-fg-secondary">{t('description')}</p>
      <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
        <table className="w-full text-sm" data-testid="audit-table">
          <thead className="border-b border-border text-left text-xs uppercase text-fg-muted">
            <tr>
              <th className="px-4 py-3">{t('admin')}</th>
              <th className="px-4 py-3">{t('action')}</th>
              <th className="px-4 py-3">{t('target')}</th>
              <th className="px-4 py-3">Vaqt</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-fg-muted">
                  …
                </td>
              </tr>
            ) : data?.data.length ? (
              data.data.map((row) => (
                <tr key={row.id} className="border-b border-border/50" data-testid={`audit-row-${row.action}`}>
                  <td className="px-4 py-3">{row.admin.name}</td>
                  <td className="px-4 py-3">
                    <Badge>{ta(row.action)}</Badge>
                    <span className="ml-2 text-xs text-fg-muted">{row.action}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-secondary">
                    {row.targetType} · {row.targetId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{formatDateTimeTak(row.createdAt)}</td>
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
          {t('loadMore')}
        </button>
      ) : null}
    </section>
  );
}

function JobsTab() {
  const t = useTranslations('admin.settings.jobs');
  const { data, isPending } = useJobs();

  return (
    <section className="space-y-3">
      <p className="text-sm text-fg-secondary">{t('description')}</p>
      {isPending ? (
        <p className="text-sm text-fg-muted">…</p>
      ) : data?.length ? (
        <ul className="space-y-3" data-testid="jobs-list">
          {data.map((queue) => (
            <li key={queue.queue} className="rounded-[12px] border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{queue.queue}</h3>
                <span className="text-xs text-fg-muted">
                  {t('nextRun')}: {queue.nextRunAt ? formatDateTimeTak(new Date(queue.nextRunAt)) : '—'}
                </span>
              </div>
              <p className="mt-2 text-xs text-fg-muted">{t('runs')}</p>
              {queue.runs.length ? (
                <ul className="mt-1 space-y-1 text-xs">
                  {queue.runs.slice(0, 20).map((run, index) => (
                    <li key={`${run.id}-${index}`} className="flex items-center justify-between gap-2">
                      <span className={run.state === 'failed' ? 'text-error' : 'text-fg-secondary'}>
                        {run.state}
                        {run.failedReason ? ` — ${run.failedReason}` : ''}
                      </span>
                      <span className="text-fg-muted">
                        {run.finishedAt ? formatDateTimeTak(new Date(run.finishedAt)) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-fg-muted">{t('empty')}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t('empty')}</p>
      )}
    </section>
  );
}
