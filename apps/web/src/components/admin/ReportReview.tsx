'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ReportDTOT, ReportResolveBodyT } from '@rentuz/contracts';
import { Badge } from '@rentuz/ui';
import { useResolveReport } from '@/hooks/use-admin';
import { ConfirmModal } from './ConfirmModal';

/**
 * §61 report review: evidence + target preview + resolve/reject/escalate.
 * Reject requires a note; resolve can suspend the target user and/or remove
 * the listing; escalate flips priority to CRITICAL.
 */
export function ReportReview({ report, onClose }: { report: ReportDTOT; onClose: () => void }) {
  const t = useTranslations('admin.reports');
  const tc = useTranslations('admin.common');
  const resolve = useResolveReport();
  const [modal, setModal] = useState<'resolve' | 'reject' | null>(null);
  const [suspendTarget, setSuspendTarget] = useState(false);
  const [removeListing, setRemoveListing] = useState(false);

  const submit = async (note: string) => {
    if (!modal) return;
    const body: ReportResolveBodyT = {
      action: modal === 'resolve' ? 'RESOLVED' : 'REJECTED',
      ...(note ? { note } : {}),
      ...(modal === 'resolve' ? { suspendTarget, removeListing } : {}),
    };
    await resolve.mutateAsync({ reportId: report.id, body });
    setModal(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-5"
        onClick={(event) => event.stopPropagation()}
        data-testid="report-review"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <button type="button" onClick={onClose} className="text-sm text-fg-muted hover:text-fg">
            {tc('close')}
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={report.priority === 'CRITICAL' ? 'error' : report.priority === 'HIGH' ? 'primary' : 'info'}>
              {t(`priority_${report.priority}`)}
            </Badge>
            <Badge>{t(`status_${report.status}`)}</Badge>
            <Badge variant="outline">{t(`targetType_${report.targetType}`)}</Badge>
          </div>

          <dl className="space-y-2 text-sm">
            <Row label={t('reporter')} value={`${report.reporter.name} · ${report.reporter.phone}`} />
            <Row label={t('reason')} value={t(`reasons.${report.reason}`)} />
            <Row label={t('target')} value={report.target?.label ?? report.targetId} />
          </dl>

          {report.description ? <p className="text-sm text-fg-secondary">{report.description}</p> : null}

          {report.evidence.length ? (
            <section>
              <h3 className="text-sm font-semibold">{t('evidence')}</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {report.evidence.map((item, index) => (
                  <li key={`${item.kind}-${index}`} className="rounded-[8px] border border-border bg-elevated p-2">
                    {item.kind === 'image' ? (
                      <img src={item.ref} alt="" className="max-h-40 rounded-[6px]" />
                    ) : (
                      <span>{item.ref}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {report.resolutionNote ? (
            <p className="text-sm text-fg-muted">{t('resolutionNote')}: {report.resolutionNote}</p>
          ) : null}

          {report.status === 'OPEN' || report.status === 'REVIEWING' ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => void resolve.mutateAsync({ reportId: report.id, body: { action: 'ESCALATED' } })}
                className="h-10 rounded-[12px] bg-primary px-4 text-sm font-medium text-black"
                data-testid="report-escalate"
              >
                {t('escalate')}
              </button>
              <button
                type="button"
                onClick={() => setModal('resolve')}
                className="h-10 rounded-[12px] bg-success px-4 text-sm font-medium text-white"
                data-testid="report-resolve"
              >
                {t('resolve')}
              </button>
              <button
                type="button"
                onClick={() => setModal('reject')}
                className="h-10 rounded-[12px] border border-border px-4 text-sm text-fg-secondary hover:text-fg"
                data-testid="report-reject"
              >
                {t('reject')}
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <ConfirmModal
        open={modal !== null}
        title={modal === 'reject' ? t('reject') : t('resolve')}
        confirmLabel={modal === 'reject' ? t('reject') : t('resolve')}
        danger={modal === 'reject'}
        reasonRequired={modal === 'reject'}
        reasonOptional={modal === 'resolve'}
        reasonLabel={modal === 'reject' ? tc('reasonLabel') : t('resolutionNote')}
        busy={resolve.isPending}
        onConfirm={(note) => void submit(note)}
        onClose={() => setModal(null)}
      >
        {modal === 'resolve' ? (
          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={suspendTarget} onChange={(e) => setSuspendTarget(e.target.checked)} />
              {t('suspendTarget')}
            </label>
            {report.targetType === 'PROPERTY' ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={removeListing} onChange={(e) => setRemoveListing(e.target.checked)} />
                {t('removeListing')}
              </label>
            ) : null}
          </div>
        ) : null}
      </ConfirmModal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}
