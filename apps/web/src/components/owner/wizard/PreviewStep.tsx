'use client';

import { useTranslations } from 'next-intl';
import type { WizardProperty } from './WizardForm';

export function PreviewStep({ value }: { value: WizardProperty }) {
  const t = useTranslations('wizard');
  const required = [
    { key: 'title', label: t('field.title'), ok: value.title.length >= 8 },
    { key: 'description', label: t('field.description'), ok: value.description.length >= 20 },
    { key: 'rooms', label: t('field.rooms'), ok: value.rooms > 0 },
    { key: 'area', label: t('field.area'), ok: value.area > 0 },
    { key: 'address', label: t('field.address'), ok: value.address.length >= 5 },
    { key: 'price', label: t('field.price'), ok: value.price > 0 },
    { key: 'regionId', label: 'Viloyat', ok: !!value.regionId },
  ];
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('steps.preview')}</h2>
      <ul className="space-y-1">
        {required.map(({ key, label, ok }) => (
          <li
            key={key}
            className={[
              'flex items-center gap-2 rounded-[12px] border px-3 py-2 text-sm',
              ok ? 'border-success/40 bg-success/5 text-success' : 'border-error/40 bg-error/5 text-error',
            ].join(' ')}
          >
            <span aria-hidden>{ok ? '✓' : '✗'}</span>
            <span>{label}</span>
            <span className="ml-auto text-xs">{ok ? 'tayyor' : 'kerak'}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">Submit tugmasi barcha maydonlar tayyor bo'lganda faollashadi.</p>
    </div>
  );
}
