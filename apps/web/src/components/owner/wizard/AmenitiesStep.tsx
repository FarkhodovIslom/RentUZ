'use client';

import { useTranslations } from 'next-intl';
import type { WizardProperty } from './WizardForm';

const AMENITY_KEYS = [
  'wifi', 'parking', 'furniture', 'ac', 'tv', 'fridge', 'washer', 'elevator', 'security',
] as const;

export function AmenitiesStep({
  value,
  onChange,
}: {
  value: WizardProperty;
  onChange: (patch: Partial<WizardProperty>) => void;
}) {
  const t = useTranslations('wizard.amenities');
  const toggle = (key: string) => {
    const set = new Set(value.amenities);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onChange({ amenities: Array.from(set) });
  };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Qulayliklar</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {AMENITY_KEYS.map((key) => {
          const checked = value.amenities.includes(key);
          return (
            <label
              key={key}
              className={[
                'flex cursor-pointer items-center gap-2 rounded-[12px] border px-3 py-2 text-sm transition-colors',
                checked ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-elevated',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(key)}
                className="size-4 accent-primary"
              />
              <span>{t(key)}</span>
            </label>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.petsAllowed}
            onChange={(e) => onChange({ petsAllowed: e.target.checked })}
            className="size-4 accent-primary"
          />
          <span>Uy hayvonlari mumkin</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.smokingAllowed}
            onChange={(e) => onChange({ smokingAllowed: e.target.checked })}
            className="size-4 accent-primary"
          />
          <span>Chekish mumkin</span>
        </label>
        <div>
          <label htmlFor="furnished" className="mb-1.5 block text-sm font-medium text-fg-secondary">
            Jihozlanganlik
          </label>
          <select
            id="furnished"
            value={value.furnished}
            onChange={(e) => onChange({ furnished: e.target.value })}
            className="h-11 w-full rounded-[12px] border border-border bg-input px-3 text-sm text-fg focus:border-primary focus:outline-none"
          >
            <option value="NONE">Yo'q</option>
            <option value="PARTIAL">Qisman</option>
            <option value="FULL">To'liq</option>
          </select>
        </div>
      </div>
    </div>
  );
}
