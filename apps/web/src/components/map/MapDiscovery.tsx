'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MapMarkerDTOT } from '@rentuz/contracts';
import { api } from '@/lib/api';
import { MapView } from './MapView';
import { Skeleton } from '@rentuz/ui';

/**
 * §17 section 9 — lazy discovery map. Uses the bbox map endpoint with a
 * national viewport (the map API is bbox-based; "latest" ordering is the
 * list's job next to it).
 */
export function MapDiscovery() {
  const [selected, setSelected] = useState<MapMarkerDTOT | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ['map-discovery'],
    queryFn: () =>
      api.get<{ markers: MapMarkerDTOT[]; truncated: boolean }>(
        '/search/map?swLng=55.5&swLat=36.5&neLng=73.5&neLat=45.5',
      ),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (isPending) {
    return <Skeleton className="h-80 w-full rounded-[16px]" />;
  }

  return (
    <div className="h-80 overflow-hidden rounded-[16px] border border-border">
      <MapView
        markers={data?.markers ?? []}
        fallbackCenter={[66.9, 41.3]}
        initialZoom={4.5}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
