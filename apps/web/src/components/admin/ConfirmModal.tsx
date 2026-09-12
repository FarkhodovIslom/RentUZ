'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Shared admin confirmation modal (§1.7 item 25). Every reason-taking admin
 * action funnels through it: destructive copy, an optional mandatory reason
 * textarea (min 10 chars — the API enforces the same), optional extra
 * controls (e.g. suspendTarget / removeListing toggles), and a busy state.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  reasonRequired = false,
  reasonOptional = false,
  reasonLabel,
  busy = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  reasonRequired?: boolean;
  /** Show the textarea but allow an empty value (e.g. optional resolve note). */
  reasonOptional?: boolean;
  reasonLabel?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations('admin.common');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  const valid = !reasonRequired || reason.trim().length >= 10;
  const showReason = reasonRequired || reasonOptional;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[16px] border border-border bg-card p-5"
        onClick={(event) => event.stopPropagation()}
        data-testid="confirm-modal"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-fg-secondary">{description}</p> : null}

        {showReason ? (
          <label className="mt-4 block text-sm">
            <span className="text-fg-secondary">{reasonLabel ?? t('reasonLabel')}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              minLength={reasonRequired ? 10 : undefined}
              maxLength={500}
              className="mt-1 w-full rounded-[10px] border border-border bg-input px-3 py-2 text-sm"
              data-testid="confirm-reason"
            />
            {reasonRequired && reason.length > 0 && reason.trim().length < 10 ? (
              <span className="mt-1 block text-xs text-error">Kamida 10 belgi</span>
            ) : null}
          </label>
        ) : null}

        {children}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[12px] border border-border px-4 text-sm text-fg-secondary hover:text-fg"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => onConfirm(reason.trim())}
            className={`h-10 rounded-[12px] px-4 text-sm font-medium text-black disabled:opacity-50 ${
              danger ? 'bg-error' : 'bg-primary hover:bg-primary-hover'
            }`}
            data-testid="confirm-submit"
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
