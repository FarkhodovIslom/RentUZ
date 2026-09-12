'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { MapMarkerDTOT, PropertyCardDTOT } from '@rentuz/contracts';
import { api } from '@/lib/api';
import { Skeleton } from '@rentuz/ui';
import { MapView, type ViewportState } from './MapView';
import { formatPriceUzs, TYPE_OPTIONS } from '@/components/search/filter-utils';

const RADIUS_STEPS_M = [1000, 2000, 5000, 10000, 20000, 30000];

/**
 * Viewport used when /map is opened without URL params: Tashkent at the same
 * zoom MapView falls back to. Seeding it up front keeps markers and the URL
 * independent of the map's onLoad — external basemap tiles must not be a
 * hard dependency for the page to function (§63 URL-as-truth).
 */
const DEFAULT_VIEWPORT: MapUrlState = {
  swLng: 68.803,
  swLat: 41.091,
  neLng: 69.677,
  neLat: 41.531,
  zoom: 10.5,
  lng: 69.2401,
  lat: 41.3111,
};

interface MapUrlState {
  swLng: number;
  swLat: number;
  neLng: number;
  neLat: number;
  zoom: number;
  lng: number;
  lat: number;
  type?: string;
  minPrice?: string;
  maxPrice?: string;
  verified?: string;
}

function numberParam(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseUrlState(searchParams: URLSearchParams): MapUrlState | null {
  const swLng = numberParam(searchParams.get('swLng'));
  const swLat = numberParam(searchParams.get('swLat'));
  const neLng = numberParam(searchParams.get('neLng'));
  const neLat = numberParam(searchParams.get('neLat'));
  const zoom = numberParam(searchParams.get('zoom')) ?? 10.5;
  const lng = numberParam(searchParams.get('lng')) ?? 69.2401;
  const lat = numberParam(searchParams.get('lat')) ?? 41.3111;
  if (swLng === undefined || swLat === undefined || neLng === undefined || neLat === undefined) {
    return null;
  }
  return {
    swLng,
    swLat,
    neLng,
    neLat,
    zoom,
    lng,
    lat,
    type: searchParams.get('type') ?? undefined,
    minPrice: searchParams.get('minPrice') ?? undefined,
    maxPrice: searchParams.get('maxPrice') ?? undefined,
    verified: searchParams.get('verified') ?? undefined,
  };
}

/**
 * /map explorer (§21): bbox markers from /search/map, side list from
 * /search/properties around the map center with a radius slider. Viewport
 * and filters live in the URL (§63) — history.replaceState keeps pan/drag
 * cheap (no RSC round trip); markers refetch via react-query.
 */
function MapExplorerInner() {
  // Parse the URL once on mount — the URL stays the shareable source of
  // truth (§63); later updates go through local state + history.replaceState.
  const searchParams = useSearchParams();
  const initial = useMemo(() => parseUrlState(searchParams), [searchParams]);
  const [urlState, setUrlState] = useState<MapUrlState>(initial ?? DEFAULT_VIEWPORT);
  const [selected, setSelected] = useState<MapMarkerDTOT | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [radiusIdx, setRadiusIdx] = useState(2);
  const replaceTimer = useRef<number | null>(null);

  const mapQuery = useQuery({
    queryKey: ['map-markers', urlState],
    queryFn: async () => {
      const s = urlState;
      if (!s) return { markers: [] as MapMarkerDTOT[], truncated: false };
      const qs = new URLSearchParams({
        swLng: String(s.swLng),
        swLat: String(s.swLat),
        neLng: String(s.neLng),
        neLat: String(s.neLat),
      });
      if (s.type) qs.set('type', s.type);
      if (s.minPrice) qs.set('minPrice', s.minPrice);
      if (s.maxPrice) qs.set('maxPrice', s.maxPrice);
      if (s.verified) qs.set('verified', s.verified);
      return api.get<{ markers: MapMarkerDTOT[]; truncated: boolean }>(`/search/map?${qs.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const markers = mapQuery.data?.markers ?? [];
  const truncated = mapQuery.data?.truncated ?? false;

  const listCenter = urlState
    ? { lng: urlState.lng, lat: urlState.lat, radius: RADIUS_STEPS_M[radiusIdx] }
    : null;

  const listQuery = useQuery({
    queryKey: ['map-list', listCenter],
    queryFn: async () => {
      if (!listCenter) return { data: [] as PropertyCardDTOT[], meta: { total: 0 } };
      const qs = new URLSearchParams({
        lng: String(listCenter.lng),
        lat: String(listCenter.lat),
        radius: String(listCenter.radius),
        sort: 'newest',
        limit: '20',
      });
      const urlStateValue = urlState;
      if (urlStateValue?.type) qs.set('type', urlStateValue.type);
      if (urlStateValue?.minPrice) qs.set('minPrice', urlStateValue.minPrice);
      if (urlStateValue?.maxPrice) qs.set('maxPrice', urlStateValue.maxPrice);
      if (urlStateValue?.verified) qs.set('verified', urlStateValue.verified);
      return api.get<{ data: PropertyCardDTOT[]; meta: { total: number } }>(
        `/search/properties?${qs.toString()}`,
      );
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  // URL-as-truth (§63): viewport/filters land in the address bar, debounced.
  const syncUrl = (next: MapUrlState) => {
    setUrlState(next);
    if (replaceTimer.current) window.clearTimeout(replaceTimer.current);
    replaceTimer.current = window.setTimeout(() => {
      const qs = new URLSearchParams({
        swLng: String(next.swLng),
        swLat: String(next.swLat),
        neLng: String(next.neLng),
        neLat: String(next.neLat),
        zoom: String(next.zoom),
        lng: String(next.lng),
        lat: String(next.lat),
      });
      if (next.type) qs.set('type', next.type);
      if (next.minPrice) qs.set('minPrice', next.minPrice);
      if (next.maxPrice) qs.set('maxPrice', next.maxPrice);
      if (next.verified) qs.set('verified', next.verified);
      window.history.replaceState(null, '', `/map?${qs.toString()}`);
    }, 300);
  };

  useEffect(() => {
    // Land on /map without URL params: write the default viewport into the
    // address bar right away (debounced replaceState) so the URL always
    // carries a bbox, even if the basemap's onLoad never fires.
    if (!initial) syncUrl(DEFAULT_VIEWPORT);
    return () => {
      if (replaceTimer.current) window.clearTimeout(replaceTimer.current);
    };
  }, [initial]);

  const setFilter = (key: 'type' | 'minPrice' | 'maxPrice' | 'verified', value: string) => {
    if (!urlState) return;
    const next = { ...urlState, [key]: value || undefined };
    syncUrl(next);
  };

  const viewport = urlState;
  const list = listQuery.data?.data ?? [];

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col lg:flex-row">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 lg:border-b-0 lg:border-r lg:py-3">
        <select
          aria-label="Uy turi"
          value={urlState?.type ?? ''}
          onChange={(e) => setFilter('type', e.target.value)}
          className="h-9 rounded-[12px] border border-border bg-bg px-2 text-sm outline-none"
        >
          <option value="">Barcha turlar</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          placeholder="Narx (dan)"
          aria-label="Narx (dan)"
          defaultValue={urlState?.minPrice ?? ''}
          onBlur={(e) => setFilter('minPrice', e.target.value)}
          className="h-9 w-28 rounded-[12px] border border-border bg-bg px-2 text-sm outline-none"
        />
        <input
          type="number"
          inputMode="numeric"
          placeholder="Narx (gacha)"
          aria-label="Narx (gacha)"
          defaultValue={urlState?.maxPrice ?? ''}
          onBlur={(e) => setFilter('maxPrice', e.target.value)}
          className="h-9 w-28 rounded-[12px] border border-border bg-bg px-2 text-sm outline-none"
        />
        <label className="flex h-9 cursor-pointer items-center gap-2 px-1 text-xs text-fg-secondary">
          <input
            type="checkbox"
            checked={urlState?.verified === 'true'}
            onChange={(e) => setFilter('verified', e.target.checked ? 'true' : '')}
            className="h-4 w-4 accent-[#FFA31A]"
          />
          Tasdiqlangan
        </label>
        <label className="ml-auto flex items-center gap-2 text-xs text-fg-secondary">
          Radius
          <input
            type="range"
            min={0}
            max={RADIUS_STEPS_M.length - 1}
            step={1}
            value={radiusIdx}
            onChange={(e) => setRadiusIdx(Number(e.target.value))}
            aria-label="Qidiruv radiusi"
            className="w-24 accent-[#FFA31A]"
          />
          {RADIUS_STEPS_M[radiusIdx] / 1000} km
        </label>
      </div>

      {/* Map */}
      <div className="relative min-h-[50dvh] flex-1">
        <MapView
          markers={markers}
          initialBounds={
            urlState
              ? { swLng: urlState.swLng, swLat: urlState.swLat, neLng: urlState.neLng, neLat: urlState.neLat }
              : null
          }
          initialZoom={urlState?.zoom}
          onViewportChange={(v: ViewportState) => {
            // Drop sub-0.0001° jitter — cluster zoom-ins shouldn't spam the URL.
            const micro =
              Math.abs(v.swLng - urlState.swLng) < 0.0001 &&
              Math.abs(v.neLng - urlState.neLng) < 0.0001 &&
              Math.abs(v.swLat - urlState.swLat) < 0.0001;
            if (micro) return;
            syncUrl({
              ...v,
              type: urlState.type,
              minPrice: urlState.minPrice,
              maxPrice: urlState.maxPrice,
              verified: urlState.verified,
            });
          }}
          highlightedId={hoveredId ?? selected?.id ?? null}
          selected={selected}
          onSelect={setSelected}
        />
        {truncated ? (
          <div className="absolute inset-x-4 top-4 rounded-[12px] border border-primary/40 bg-bg/95 px-3 py-2 text-center text-xs text-fg-secondary">
            Juda ko&apos;p belgi — yaqinlashtiring ({markers.length}+)
          </div>
        ) : null}
      </div>

      {/* Side list */}
      <aside className="w-full overflow-y-auto border-t border-border bg-bg p-4 lg:w-80 lg:border-l lg:border-t-0">
        <p className="mb-3 text-sm font-semibold">
          {listQuery.isPending ? '…' : `${listQuery.data?.meta.total ?? 0} ta e'lon`}
        </p>
        {listQuery.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-[12px]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-border p-6 text-center text-sm text-fg-muted">
            Bu hududda e&apos;lon yo&apos;q — xaritani surib ko&apos;ring
          </p>
        ) : (
          <ul className="space-y-3">
            {list.map((card) => (
              <li
                key={card.id}
                onMouseEnter={() => setHoveredId(card.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`rounded-[12px] border p-3 transition-colors ${
                  (hoveredId ?? selected?.id) === card.id ? 'border-primary bg-card' : 'border-border bg-card'
                }`}
              >
                <Link href={`/property/${card.slug}`} className="flex gap-3">
                  {card.mainImageUrl ? (
                    <img
                      src={card.mainImageUrl}
                      alt=""
                      loading="lazy"
                      className="h-16 w-20 shrink-0 rounded-[8px] object-cover"
                    />
                  ) : (
                    <span className="grid h-16 w-20 shrink-0 place-items-center rounded-[8px] bg-elevated text-xs text-fg-muted">
                      Rasm yo&apos;q
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{card.title}</p>
                    <p className="line-clamp-1 text-xs text-fg-muted">
                      {card.regionName ? `${card.regionName}, ` : ''}
                      {card.address}
                    </p>
                    <p className="mt-1 text-sm font-bold text-primary">
                      {formatPriceUzs(card.price)} {card.currency}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {viewport ? (
          <p className="mt-4 text-center text-[11px] text-fg-muted">
            Markaz: {viewport.lat.toFixed(3)}, {viewport.lng.toFixed(3)} · radius {(RADIUS_STEPS_M[radiusIdx] / 1000).toFixed(0)} km
          </p>
        ) : null}
      </aside>
    </div>
  );
}

export function MapExplorer() {
  return (
    <Suspense
      fallback={<div className="h-[calc(100dvh-4rem)] animate-pulse bg-elevated" aria-busy="true" />}
    >
      <MapExplorerInner />
    </Suspense>
  );
}
