'use client';

import { useTranslations } from 'next-intl';
import type { WizardProperty } from './WizardForm';

export function DescriptionStep({
  value,
  onChange,
}: {
  value: WizardProperty;
  onChange: (patch: Partial<WizardProperty>) => void;
}) {
  const t = useTranslations('wizard');
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('steps.description')}</h2>
      <p className="text-sm text-fg-secondary">
        Qo'shimcha tavsif, qoidalar, deposit shartlari va h.k.
      </p>
      <textarea
        rows={10}
        value={value.description}
        onChange={(e) => onChange({ description: e.target.value })}
        className="w-full rounded-[12px] border border-border bg-input p-3 text-sm text-fg focus:border-primary focus:outline-none"
        maxLength={8000}
      />
      <p className="text-xs text-fg-muted">{value.description.length} / 8000</p>
    </div>
  );
}
