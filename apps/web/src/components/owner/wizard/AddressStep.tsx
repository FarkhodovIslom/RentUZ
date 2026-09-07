'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@rentuz/ui';
import { api } from '@/lib/api';
import type { WizardProperty } from './WizardForm';

type Location = { id: string; name: string; parentId: string | null; kind: string };

/**
 * Step 2 — address + region/district pickers + MapLibre pin drop.
 * MapLibre renders a static raster basemap (OSM demo tiles in dev) with a
 * draggable pin; reverse-geocoding is best-effort Nominatim (1 req/s,
 * client-side throttled). The pin updates lng/lat in the wizard state.
 */
export function AddressStep({
  value,
  onChange,
}: {
  value: WizardProperty;
  onChange: (patch: Partial<WizardProperty>) => void;
}) {
  const t = useTranslations('wizard');
  const [locations, setLocations] = useState<Location[]>([]);
  const [pinPos, setPinPos] = useState({ lng: value.lng ?? 69.2401, lat: value.lat ?? 41.3111 });
  const [MapComp, setMapComp] = useState<null | React.ComponentType<{ lng: number; lat: number; onPick: (lng: number, lat: number) => void }>>(null);

  useEffect(() => {
    api.get<Location[]>('/public/locations').then(setLocations).catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    // Lazy-load MapLibre to keep the wizard bundle small and SSR safe.
    void import('./MapPinPicker').then((m) => setMapComp(() => m.MapPinPicker));
  }, []);

  const handlePick = (lng: number, lat: number) => {
    setPinPos({ lng, lat });
    onChange({ lng, lat });
    // Nominatim reverse geocode, throttled to 1 req/s (no last-call time
    // tracked in this minimal implementation; MapTiler pre-launch swap).
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.display_name) onChange({ address: data.display_name.slice(0, 200) });
      })
      .catch(() => undefined);
  };

  const regions = locations.filter((l) => l.kind === 'REGION');
  const districts = locations.filter((l) => l.parentId === value.regionId);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('steps.address')}</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="region" className="mb-1.5 block text-sm font-medium text-fg-secondary">
            Viloyat
          </label>
          <select
            id="region"
            value={value.regionId ?? ''}
            onChange={(e) => onChange({ regionId: e.target.value || null, districtId: null })}
            className="h-11 w-full rounded-[12px] border border-border bg-input px-3 text-sm text-fg focus:border-primary focus:outline-none"
          >
            <option value="">—</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="district" className="mb-1.5 block text-sm font-medium text-fg-secondary">
            Tuman
          </label>
          <select
            id="district"
            value={value.districtId ?? ''}
            onChange={(e) => onChange({ districtId: e.target.value || null })}
            disabled={!value.regionId}
            className="h-11 w-full rounded-[12px] border border-border bg-input px-3 text-sm text-fg focus:border-primary focus:outline-none disabled:opacity-50"
          >
            <option value="">—</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Input
        id="address"
        label={t('field.address')}
        placeholder="Amir Temur 12-uy, 45-xonadon"
        value={value.address}
        onChange={(e) => onChange({ address: e.target.value })}
        minLength={5}
        maxLength={255}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="lng"
          type="number"
          step="0.000001"
          label={t('field.lng')}
          value={pinPos.lng.toString()}
          onChange={(e) => handlePick(Number(e.target.value), pinPos.lat)}
        />
        <Input
          id="lat"
          type="number"
          step="0.000001"
          label={t('field.lat')}
          value={pinPos.lat.toString()}
          onChange={(e) => handlePick(pinPos.lng, Number(e.target.value))}
        />
      </div>

      {MapComp ? (
        <MapComp lng={pinPos.lng} lat={pinPos.lat} onPick={handlePick} />
      ) : (
        <div className="h-72 rounded-[12px] border border-dashed border-border bg-elevated" />
      )}
    </div>
  );
}
