import { useEffect, useMemo } from 'react';

import type { GeoPolygon, GeoRing } from '@/shared/api';
import { polygonParts } from '@/shared/lib/polygon';

import { useMap } from './mapContext';

interface MapPolygonProps {
  /** GeoJSON `Polygon` / `MultiPolygon`; a MultiPolygon is drawn as several polygons. */
  geometry: GeoPolygon;
  /** Hex colour (`#RRGGBB`) of the outline and the fill. */
  color: string;
  /** Fill opacity 0..1. */
  fillOpacity?: number;
  /** Outline opacity 0..1; `0` draws no outline. */
  strokeOpacity?: number;
  /** Outline width, px. */
  strokeWidth?: number;
  /** Hidden below this zoom. */
  minZoom?: number;
  zIndex?: number;
}

const alphaHex = (opacity: number) =>
  Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');

/**
 * A territory drawn in WebGL (MapGL `Polygon`), non-interactive so taps reach the map.
 * Recreated only when the geometry or the style actually changes.
 */
export function MapPolygon({
  geometry,
  color,
  fillOpacity = 0.14,
  strokeOpacity = 0.85,
  strokeWidth = 2,
  minZoom,
  zIndex = 1,
}: MapPolygonProps) {
  const { map, api } = useMap();
  const key = useMemo(() => JSON.stringify(polygonParts(geometry)), [geometry]);

  useEffect(() => {
    if (!map || !api) return;
    const parts = JSON.parse(key) as GeoRing[][];
    const polygons = parts.map(
      (rings) =>
        new api.Polygon(map, {
          coordinates: rings,
          color: `${color}${alphaHex(fillOpacity)}`,
          strokeColor: `${color}${alphaHex(strokeOpacity)}`,
          strokeWidth: strokeOpacity > 0 ? strokeWidth : 0,
          interactive: false,
          minZoom,
          zIndex,
        }),
    );
    return () => polygons.forEach((polygon) => polygon.destroy());
  }, [map, api, key, color, fillOpacity, strokeOpacity, strokeWidth, minZoom, zIndex]);

  return null;
}
