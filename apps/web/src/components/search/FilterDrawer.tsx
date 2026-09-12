'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { LocationDTOT } from '@rentuz/contracts';
import { api } from '@/lib/api';
import { Button } from '@rentuz/ui';
import {
  buildLocationTree,
  countActiveFilters,
  FILTER_KEYS,
  formatPriceUzs,
  FURNISHED_OPTIONS,
  TYPE_OPTIONS,
  type FilterKey,
} from './filter-utils';

/**
 * All §18 filters (minus renovation — values are unnormalized free text).
 * Draft state lives locally while the drawer is open; "Qo'llash" writes
 * every key into the URL (§63) and the RSC page re-fetches server-side.
 */
export function FilterDrawer() {
  const t = useTranslations('rentals.filters');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const current = useMemo(
    () => Object.fromEntries([...searchParams.entries()]),
    [searchParams],
  );
  const [draft, setDraft] = useState<Record<string, string>>(current);

  const locationsQuery = useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get<LocationDTOT[]>('/public/locations'),
    staleTime: Infinity,
    retry: false,
  });
  const tree = useMemo(() => buildLocationTree(locationsQuery.data ?? []), [locationsQuery.data]);

  const activeCount = countActiveFilters(current);

  const openDrawer = () => {
    setDraft(current);
    setOpen(true);
  };

  const apply = () => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(draft)) {
      if (value !== '' && FILTER_KEYS.includes(key as FilterKey)) qs.set(key, value);
    }
    // Preserve sort; filters reset pagination.
    const sort = searchParams.get('sort');
    if (sort) qs.set('sort', sort);
    router.push(`${pathname}?${qs.toString()}`);
    setOpen(false);
  };

  const reset = () => setDraft({});

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const numberField = (key: string, label: string, placeholder?: string, min?: number) => (
    <label className="block">
      <span className="text-xs text-fg-secondary">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        placeholder={placeholder}
        value={draft[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        className="mt-1 h-10 w-full rounded-[12px] border border-border bg-card px-3 text-sm outline-none focus:border-primary"
      />
    </label>
  );

  const selectField = (
    key: string,
    label: string,
    options: readonly { value: string; label: string }[],
    placeholder: string,
  ) => (
    <label className="block">
      <span className="text-xs text-fg-secondary">{label}</span>
      <select
        value={draft[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        className="mt-1 h-10 w-full rounded-[12px] border border-border bg-card px-3 text-sm outline-none focus:border-primary"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  const toggleField = (key: string, label: string) => (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={draft[key] === 'true'}
        onChange={(e) => set(key, e.target.checked ? 'true' : '')}
        className="h-4 w-4 accent-[var(--color-primary)]"
      />
      {label}
    </label>
  );

  const districts = tree.districtsByParent.get(draft.city ?? '') ?? [];

  const body = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {selectField('city', t('city'), tree.regions.map((r) => ({ value: r.id, label: r.name })), t('any'))}
        {selectField(
          'district',
          t('district'),
          districts.map((d) => ({ value: d.id, label: d.name })),
          draft.city ? t('any') : t('chooseCity'),
        )}
      </div>

      {selectField('type', t('type'), TYPE_OPTIONS, t('any'))}

      <div className="grid grid-cols-2 gap-3">
        {numberField('minPrice', `${t('price')} (${t('from')})`, '0', 0)}
        {numberField('maxPrice', `${t('price')} (${t('to')})`, formatPriceUzs(10_000_000), 0)}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {numberField('rooms', t('rooms'), '0', 0)}
        {numberField('bedrooms', t('bedrooms'), '0', 0)}
        {numberField('bathrooms', t('bathrooms'), '0', 0)}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {numberField('minArea', `${t('area')} (${t('from')})`, '0', 0)}
        {numberField('maxArea', `${t('area')} (${t('to')})`, '0', 0)}
      </div>

      {numberField('minFloor', t('floor'), '0', -2)}

      {selectField('furnished', t('furnished'), FURNISHED_OPTIONS, t('any'))}

      <div className="space-y-2 pt-1">
        {toggleField('pets', t('pets'))}
        {toggleField('smoking', t('smoking'))}
        {toggleField('verified', t('verified'))}
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" className="flex-1" onClick={reset} type="button">
          {t('reset')}
        </Button>
        <Button className="flex-1" onClick={apply} type="button">
          {t('apply')}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-border bg-card px-4 text-sm font-medium hover:border-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {t('title')}
        {activeCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-black">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t('title')}>
          <button
            type="button"
            aria-label="Yopish"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[18px] border-t border-border bg-bg p-4 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none md:border-l md:border-t-0">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t('title')}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Yopish" className="p-2 text-fg-muted hover:text-fg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {body}
          </div>
        </div>
      ) : null}
    </>
  );
}
