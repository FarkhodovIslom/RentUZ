import type { LocationDTOT } from '@rentuz/contracts';

/** §18 filter surface — every key lives in the URL (§63), never local-only. */
export const FILTER_KEYS = [
  'city',
  'district',
  'type',
  'minPrice',
  'maxPrice',
  'rooms',
  'bedrooms',
  'bathrooms',
  'minArea',
  'maxArea',
  'minFloor',
  'furnished',
  'pets',
  'smoking',
  'verified',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export const TYPE_OPTIONS = [
  { value: 'APARTMENT', label: 'Kvartira' },
  { value: 'HOUSE', label: 'Uy' },
  { value: 'ROOM', label: 'Xona' },
  { value: 'COMMERCIAL', label: 'Tijorat' },
  { value: 'OFFICE', label: 'Ofis' },
  { value: 'LAND', label: 'Yer' },
  { value: 'OTHER', label: 'Boshqa' },
] as const;

export const FURNISHED_OPTIONS = [
  { value: 'NONE', label: 'Mebelsiz' },
  { value: 'PARTIAL', label: 'Qismiy mebel' },
  { value: 'FULL', label: 'To‘liq mebel' },
] as const;

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Eng yangi' },
  { value: 'price_asc', label: 'Narxi arzon' },
  { value: 'price_desc', label: 'Narxi qimmat' },
  { value: 'popular', label: 'Ommabop' },
] as const;

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function firstParam(params: SearchParamsRecord, key: string): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single !== undefined && single !== '' ? single : undefined;
}

/** Whitelist + normalize search params into an API query string. */
export function buildSearchQuery(params: SearchParamsRecord, extra?: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const key of [...FILTER_KEYS, 'sort', 'page', 'limit']) {
    const value = firstParam(params, key);
    if (value) qs.set(key, value);
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value !== undefined && value !== '' && !qs.has(key)) qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function countActiveFilters(params: SearchParamsRecord): number {
  return FILTER_KEYS.reduce((count, key) => (firstParam(params, key) ? count + 1 : count), 0);
}

export interface LocationTree {
  regions: LocationDTOT[];
  districtsByParent: Map<string, LocationDTOT[]>;
}

export function buildLocationTree(locations: LocationDTOT[]): LocationTree {
  const regions = locations.filter((l) => l.kind === 'REGION');
  const districtsByParent = new Map<string, LocationDTOT[]>();
  for (const l of locations) {
    if (l.kind !== 'DISTRICT' || !l.parentId) continue;
    const list = districtsByParent.get(l.parentId) ?? [];
    list.push(l);
    districtsByParent.set(l.parentId, list);
  }
  return { regions, districtsByParent };
}

export function formatPriceUzs(value: number): string {
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(value);
}
