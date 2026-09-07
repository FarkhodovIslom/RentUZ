'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@rentuz/ui';
import type { WizardProperty } from './WizardForm';

export function PriceStep({
  value,
  onChange,
}: {
  value: WizardProperty;
  onChange: (patch: Partial<WizardProperty>) => void;
}) {
  const t = useTranslations('wizard');
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('steps.price')}</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Input
            id="price"
            type="number"
            step="1000"
            label={t('field.price')}
            placeholder="3500000"
            value={value.price > 0 ? String(value.price) : ''}
            onChange={(e) => onChange({ price: Number(e.target.value) })}
          />
        </div>
        <div>
          <label htmlFor="currency" className="mb-1.5 block text-sm font-medium text-fg-secondary">
            Valyuta
          </label>
          <select
            id="currency"
            value={value.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
            className="h-11 w-full rounded-[12px] border border-border bg-input px-3 text-sm text-fg focus:border-primary focus:outline-none"
          >
            <option value="UZS">UZS</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input
          id="rooms"
          type="number"
          label={t('field.rooms')}
          value={String(value.rooms)}
          onChange={(e) => onChange({ rooms: Number(e.target.value) })}
          min={0}
          max={20}
        />
        <Input
          id="bedrooms"
          type="number"
          label="Yotoqxona"
          value={String(value.bedrooms)}
          onChange={(e) => onChange({ bedrooms: Number(e.target.value) })}
          min={0}
          max={20}
        />
        <Input
          id="bathrooms"
          type="number"
          label="Hammom"
          value={String(value.bathrooms)}
          onChange={(e) => onChange({ bathrooms: Number(e.target.value) })}
          min={0}
          max={20}
        />
      </div>
      <Input
        id="area"
        type="number"
        step="1"
        label={`${t('field.area')} m²`}
        value={value.area > 0 ? String(value.area) : ''}
        onChange={(e) => onChange({ area: Number(e.target.value) })}
        min={1}
        max={10000}
      />
    </div>
  );
}
