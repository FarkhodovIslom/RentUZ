'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminUsersListQueryT } from '@rentuz/contracts';
import { useAdminUsers } from '@/hooks/use-admin';
import { UserDetailDrawer } from '@/components/admin/UserDetailDrawer';

/** §58 user browser: search + role/status/date filters + detail drawer. */
export default function AdminUsersPage() {
  const t = useTranslations('admin.users');
  const tc = useTranslations('admin.common');
  const [query, setQuery] = useState<AdminUsersListQueryT>({ limit: 20 });
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isPending } = useAdminUsers(query);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <div className="flex flex-wrap items-end gap-2" data-testid="users-filters">
        <input
          value={query.search ?? ''}
          onChange={(event) => setQuery((q) => ({ ...q, search: event.target.value || undefined }))}
          placeholder={t('search')}
          className="h-10 min-w-56 flex-1 rounded-[10px] border border-border bg-input px-3 text-sm"
        />
        <select
          value={query.role ?? ''}
          onChange={(event) => setQuery((q) => ({ ...q, role: (event.target.value || undefined) as AdminUsersListQueryT['role'] }))}
          className="h-10 rounded-[10px] border border-border bg-input px-3 text-sm"
          aria-label={t('role')}
        >
          <option value="">{t('role')}</option>
          <option value="USER">{t('role_USER')}</option>
          <option value="ADMIN">{t('role_ADMIN')}</option>
        </select>
        <select
          value={query.status ?? ''}
          onChange={(event) => setQuery((q) => ({ ...q, status: (event.target.value || undefined) as AdminUsersListQueryT['status'] }))}
          className="h-10 rounded-[10px] border border-border bg-input px-3 text-sm"
          aria-label={t('status')}
        >
          <option value="">{t('status')}</option>
          <option value="ACTIVE">{t('status_ACTIVE')}</option>
          <option value="SUSPENDED">{t('status_SUSPENDED')}</option>
          <option value="DELETED">{t('status_DELETED')}</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
        <table className="w-full text-sm" data-testid="users-table">
          <thead className="border-b border-border text-left text-xs uppercase text-fg-muted">
            <tr>
              <th className="px-4 py-3">Ism</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">{t('role')}</th>
              <th className="px-4 py-3">{t('status')}</th>
              <th className="px-4 py-3">{t('stats.properties')}</th>
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
              data.data.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => setSelected(user.id)}
                  className="cursor-pointer border-b border-border/50 hover:bg-elevated"
                >
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3 text-fg-secondary">{user.phone}</td>
                  <td className="px-4 py-3">{t(`role_${user.role}`)}</td>
                  <td className="px-4 py-3">{t(`status_${user.status}`)}</td>
                  <td className="px-4 py-3">{user.stats.properties}</td>
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

      {selected ? <UserDetailDrawer userId={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
