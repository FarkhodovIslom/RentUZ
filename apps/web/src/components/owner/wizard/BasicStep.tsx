'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@rentuz/ui';
import type { WizardProperty } from './WizardForm';

const TYPES = [
  ['APARTMENT', 'Kvartira'],
  ['HOUSE', 'Uy'],
  ['ROOM', 'Xona'],
  ['COMMERCIAL', 'Tijorat'],
  ['OFFICE', 'Ofis'],
  ['LAND', 'Yer'],
  ['OTHER', 'Boshqa'],
] as const;

export function BasicStep({
  value,
  onChange,
}: {
  value: WizardProperty;
  onChange: (patch: Partial<WizardProperty>) => void;
}) {
  const t = useTranslations('wizard');
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('steps.basic')}</h2>
      <Input
        id="title"
        label={t('field.title')}
        placeholder="2 xonali kvartira Toshkent markazida"
        value={value.title}
        onChange={(e) => onChange({ title: e.target.value })}
        minLength={8}
        maxLength={160}
      />
      <div>
        <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-fg-secondary">
          {t('field.type')}
        </label>
        <select
          id="type"
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value })}
          className="h-11 w-full rounded-[12px] border border-border bg-input px-3 text-sm text-fg focus:border-primary focus:outline-none"
        >
          {TYPES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="desc" className="mb-1.5 block text-sm font-medium text-fg-secondary">
          {t('field.description')}
        </label>
        <textarea
          id="desc"
          rows={6}
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="w-full rounded-[12px] border border-border bg-input p-3 text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none"
          placeholder="Yangi ta'mirlangan, metroga 5 minut..."
          minLength={20}
          maxLength={8000}
        />
      </div>
    </div>
  );
}
