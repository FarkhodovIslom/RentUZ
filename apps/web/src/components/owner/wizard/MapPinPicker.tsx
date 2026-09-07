'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map, Marker } from 'maplibre-gl';

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

/** Lazy-loaded by AddressStep. Drag the pin to update lng/lat. */
export function MapPinPicker({
  lng,
  lat,
  onPick,
}: {
  lng: number;
  lat: number;
  onPick: (lng: number, lat: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [lng, lat],
      zoom: 12,
    });
    const marker = new maplibregl.Marker({ draggable: true, color: '#FFA31A' })
      .setLngLat([lng, lat])
      .addTo(map);
    marker.on('dragend', () => {
      const { lng: newLng, lat: newLat } = marker.getLngLat();
      onPick(newLng, newLat);
    });
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
    mapRef.current?.easeTo({ center: [lng, lat], duration: 250 });
  }, [lng, lat]);

  return (
    <div
      ref={containerRef}
      className="h-72 overflow-hidden rounded-[12px] border border-border"
      aria-label="Manzil tanlash uchun xarita"
    />
  );
}
