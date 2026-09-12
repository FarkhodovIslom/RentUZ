'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

/** Read-only location map for the property details page (§20). */
export function PropertyMiniMap({ lng, lat, label }: { lng: number; lat: number; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [lng, lat],
      zoom: 14,
      interactive: false,
    });
    new maplibregl.Marker({ color: '#FFA31A' }).setLngLat([lng, lat]).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lng, lat]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`${label} — joylashuv xaritada`}
      className="h-64 overflow-hidden rounded-[16px] border border-border"
    />
  );
}
