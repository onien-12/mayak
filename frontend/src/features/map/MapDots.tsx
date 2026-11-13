import { useEffect, useEffectEvent, useMemo } from 'react';

import { markPressHandled } from '@/shared/lib/pressGuard';
import type { LatLng } from '@/shared/lib/geo';

import { useMap } from './mapContext';

export interface MapDot extends LatLng {
  /** Returned to `onClick`. */
  id: string | number;
  /** Hex colour of the dot. */
  color: string;
}

interface MapDotsProps {
  /** Up to ~2000 points. */
  dots: readonly MapDot[];
  /** Dots are hidden below this zoom (they are noise on a city-wide view). */
  minZoom?: number;
  /** Diameter in px. */
  size?: number;
  onClick?: (id: MapDot['id']) => void;
}

const DEFAULT_MIN_ZOOM = 13.5;

/**
 * Lightweight layer of small coloured dots (e.g. houses affected by an outage). Drawn in
 * WebGL as MapGL `CircleMarker`s — no DOM per dot — so a couple of thousand stay smooth.
 */
export function MapDots({ dots, minZoom = DEFAULT_MIN_ZOOM, size = 11, onClick }: MapDotsProps) {
  const { map, api } = useMap();
  const interactive = onClick !== undefined;
  const key = useMemo(() => JSON.stringify(dots), [dots]);

  const click = useEffectEvent((id: MapDot['id']) => {
    markPressHandled();
    onClick?.(id);
  });

  useEffect(() => {
    if (!map || !api) return;
    const items = JSON.parse(key) as MapDot[];
    const markers = items.map((dot) => {
      const marker = new api.CircleMarker(map, {
        coordinates: [dot.lng, dot.lat],
        diameter: size,
        color: dot.color,
        strokeColor: '#ffffff',
        strokeWidth: 1.5,
        minZoom,
        zIndex: 3,
        interactive,
      });
      if (interactive) marker.on('click', () => click(dot.id));
      return marker;
    });
    return () => markers.forEach((marker) => marker.destroy());
  }, [map, api, key, minZoom, size, interactive]);

  return null;
}
