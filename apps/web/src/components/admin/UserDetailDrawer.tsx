'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdminUserDTOT } from '@rentuz/contracts';
import { Badge } from '@rentuz/ui';
import { useAdminUser, useSetUserStatus } from '@/hooks/use-admin';
import { ConfirmModal } from './ConfirmModal';
import { formatDateTimeTak } from '@/lib/format';

type Action = { status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'; label: string; danger: boolean; reason: boolean };

/**
 * §58 user detail drawer: full record + stats + suspend/activate/delete.
 * Suspend/delete require a reason and list their cascade side-effects.
 */
export function UserDetailDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useTranslations('admin.users');
  const tc = useTranslations('admin.common');
  const { data: user, isPending } = useAdminUser(userId);
  const setStatus = useSetUserStatus();
  const [action, setAction] = useState<Action | null>(null);

  const actions: Action[] = [
    { status: 'SUSPENDED', label: t('actions.suspend'), danger: false, reason: true },
    { status: 'ACTIVE', label: t('actions.activate'), danger: false, reason: false },
    { status: 'DELETED', label: t('actions.delete'), danger: true, reason: true },
  ];

  const run = async (reason: string) => {
    if (!action) return;
    await setStatus.mutateAsync({ userId, body: { status: action.status, ...(action.reason ? { reason } : {}) } });
    setAction(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5"
        onClick={(event) => event.stopPropagation()}
        data-testid="user-detail-drawer"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{user?.name ?? '…'}</h2>
          <button type="button" onClick={onClose} className="text-sm text-fg-muted hover:text-fg">
            {tc('close')}
          </button>
        </div>

        {isPending || !user ? (
          <p className="text-sm text-fg-muted">{tc('loading')}</p>
        ) : (
          <UserBody user={user} actions={actions} onAction={setAction} />
        )}
      </aside>

      {action ? (
        <ConfirmModal
          open
          title={action.label}
          description={
            action.status === 'SUSPENDED'
              ? t('suspendWarning', { count: user?.stats.activeProperties ?? 0 })
              : undefined
          }
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

function UserBody({
  user,
  actions,
  onAction,
}: {
  user: AdminUserDTOT;
  actions: Action[];
  onAction: (action: Action) => void;
}) {
  const t = useTranslations('admin.users');
  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm">
        <Row label="Telefon" value={user.phone} />
        <Row label="Email" value={user.email ?? '—'} />
        <Row label="Rol" value={t(`role_${user.role}`)} />
        <Row label="Holat" value={<Badge>{t(`status_${user.status}`)}</Badge>} />
        <Row label="Ro'yxatdan o'tgan" value={formatDateTimeTak(user.createdAt)} />
      </dl>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t('stats.properties')} value={user.stats.properties} />
        <Stat label={t('stats.activeProperties')} value={user.stats.activeProperties} />
        <Stat label={t('stats.requestsAsTenant')} value={user.stats.requestsAsTenant} />
        <Stat label={t('stats.reportsAgainst')} value={user.stats.reportsAgainst} />
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {actions.map((item) => (
          <button
            key={item.status}
            type="button"
            onClick={() => onAction(item)}
            className={`h-10 rounded-[12px] px-4 text-sm font-medium ${
              item.danger ? 'bg-error text-black' : 'border border-border text-fg-secondary hover:text-fg'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] border border-border bg-elevated p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
