'use client';

import { useMemo } from 'react';
import {
  Layer,
  Map as ReactMapLibreMap,
  Popup,
  Source,
  type MapMouseEvent,
  type MapRef,
} from '@vis.gl/react-maplibre';
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapMarkerDTOT } from '@rentuz/contracts';
import { formatPriceUzs } from '@/components/search/filter-utils';

const PRIMARY = '#FFA31A';

const OSM_STYLE = {
  version: 8 as const,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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

export interface ViewportState {
  swLng: number;
  swLat: number;
  neLng: number;
  neLat: number;
  zoom: number;
  lng: number;
  lat: number;
}

interface MapViewProps {
  markers: MapMarkerDTOT[];
  initialBounds?: { swLng: number; swLat: number; neLng: number; neLat: number } | null;
  initialZoom?: number;
  fallbackCenter?: [number, number];
  onViewportChange?: (viewport: ViewportState) => void;
  highlightedId?: string | null;
  selected: MapMarkerDTOT | null;
  onSelect: (marker: MapMarkerDTOT | null) => void;
  mapRef?: (ref: MapRef | null) => void;
}

/**
 * §21 map — one GeoJSON source with native clustering (no supercluster,
 * 0_Phase.md §1 pin). Unclustered pins open a preview popup; clusters zoom in.
 */
export function MapView({
  markers,
  initialBounds,
  initialZoom,
  fallbackCenter = [69.2401, 41.3111],
  onViewportChange,
  highlightedId,
  selected,
  onSelect,
  mapRef,
}: MapViewProps) {
  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: markers
        .filter((m) => m.lat !== null && m.lng !== null)
        .map((m) => ({
          type: 'Feature' as const,
          id: m.id,
          geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
          properties: { id: m.id },
        })),
    }),
    [markers],
  );

  const markerById = useMemo(() => new globalThis.Map(markers.map((m) => [m.id, m] as const)), [markers]);

  const emitViewport = (map: MaplibreMap) => {
    if (!onViewportChange) return;
    try {
      const bounds = map.getBounds();
      const center = map.getCenter();
      onViewportChange({
        swLng: +bounds.getWest().toFixed(5),
        swLat: +bounds.getSouth().toFixed(5),
        neLng: +bounds.getEast().toFixed(5),
        neLat: +bounds.getNorth().toFixed(5),
        zoom: +map.getZoom().toFixed(2),
        lng: +center.lng.toFixed(5),
        lat: +center.lat.toFixed(5),
      });
    } catch (error) {
      console.error('[MapView] emitViewport failed', error);
    }
  };

  const onClick = async (event: MapMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const map = event.target;
    if (feature.layer?.id === 'clusters') {
      const clusterId = feature.properties?.cluster_id as number | undefined;
      const source = map.getSource('properties') as GeoJSONSource | undefined;
      if (clusterId !== undefined && source) {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: (feature.geometry as { coordinates: [number, number] }).coordinates,
          zoom: Math.min(zoom + 0.5, 16),
        });
      }
      return;
    }
    if (feature.layer?.id === 'unclustered-point') {
      const marker = markerById.get(feature.properties?.id as string);
      if (marker) onSelect(marker);
    }
  };

  return (
    <ReactMapLibreMap
      ref={mapRef}
      mapStyle={OSM_STYLE}
      initialViewState={
        initialBounds
          ? {
              bounds: [
                [initialBounds.swLng, initialBounds.swLat],
                [initialBounds.neLng, initialBounds.neLat],
              ],
              fitBoundsOptions: { padding: 40, maxZoom: initialZoom ?? 16 },
            }
          : { longitude: fallbackCenter[0], latitude: fallbackCenter[1], zoom: initialZoom ?? 10.5 }
      }
      onClick={onClick}
      onLoad={(e) => emitViewport(e.target)}
      onMoveEnd={(e) => emitViewport(e.target)}
      onError={(e) => console.error('[MapView]', e.error)}
      interactiveLayerIds={['clusters', 'unclustered-point']}
      style={{ width: '100%', height: '100%' }}
    >
      <Source
        id="properties"
        type="geojson"
        data={geojson}
        cluster
        clusterRadius={60}
        clusterMaxZoom={13}
      >
        <Layer
          id="clusters"
          type="circle"
          filter={['has', 'cluster']}
          paint={{
            'circle-color': PRIMARY,
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
            'circle-opacity': 0.9,
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={['has', 'cluster']}
          layout={{
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 13,
          }}
          paint={{ 'text-color': '#080808' }}
        />
        <Layer
          id="unclustered-point"
          type="circle"
          filter={['!', ['has', 'cluster']]}
          paint={{
            'circle-color': highlightedId
              ? [
                  'case',
                  ['==', ['get', 'id'], highlightedId],
                  PRIMARY,
                  PRIMARY,
                ]
              : PRIMARY,
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#080808',
          }}
        />
      </Source>

      {selected ? (
        <Popup
          longitude={selected.lng}
          latitude={selected.lat}
          anchor="bottom"
          offset={12}
          closeButton={false}
          onClose={() => onSelect(null)}
        >
          <a href={`/property/${selected.slug}`} className="block w-48">
            {selected.mainImage ? (
              <img src={selected.mainImage} alt="" className="h-24 w-full rounded-[8px] object-cover" />
            ) : null}
            <p className="mt-1.5 line-clamp-1 text-xs font-semibold">{selected.title}</p>
            <p className="text-xs font-bold text-primary">
              {formatPriceUzs(selected.price)} {selected.currency}
            </p>
          </a>
        </Popup>
      ) : null}
    </ReactMapLibreMap>
  );
}
