import { useEffect, useRef } from 'react';

import { MapHtmlMarker, MapRoute, useMapActions } from '@/features/map';
import type { RouteCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { boundsOfPoints } from '@/shared/lib/geo';
import { ROUTE_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';

const START_PIN = 30;

interface CatalogMapLayerProps {
  routes: readonly RouteCard[];
  previewed: RouteCard | null;
  onSelect: (route: RouteCard) => void;
}

function startOf(route: RouteCard) {
  const [lng, lat] = route.path[0] ?? [0, 0];
  return { lat, lng };
}

/**
 * Catalog on the map: a start pin for every listed route (icon of its kind) and the line
 * of the previewed one. The camera frames all starts once, when the list first arrives.
 */
export function CatalogMapLayer({ routes, previewed, onSelect }: CatalogMapLayerProps) {
  const { fitBounds, ready } = useMapActions();
  const framed = useRef(false);

  useEffect(() => {
    if (framed.current || !ready || routes.length === 0) return;
    const bounds = boundsOfPoints(routes.filter((route) => route.path.length > 0).map(startOf));
    if (bounds) fitBounds(bounds, { maxZoom: 14 });
    framed.current = true;
  }, [routes, ready, fitBounds]);

  return (
    <>
      {previewed && previewed.path.length > 1 && (
        <MapRoute key={previewed.id} path={previewed.path} />
      )}
      {routes.map((route) => {
        if (route.path.length === 0) return null;
        const meta = ROUTE_KIND_META[route.kind];
        const active = previewed?.id === route.id;
        return (
          <MapHtmlMarker
            key={route.id}
            position={startOf(route)}
            anchor={[START_PIN / 2, START_PIN / 2]}
            zIndex={active ? 44 : 32}
          >
            <button
              type="button"
              aria-label={`Старт маршрута «${route.title}»`}
              onClick={() => onSelect(route)}
              style={{ width: START_PIN, height: START_PIN }}
              className={cn(
                'flex animate-pop-in items-center justify-center rounded-full border-2 border-white shadow-pin transition-transform duration-150',
                TONES[meta.tone].solid,
                active && 'scale-125 ring-3 ring-beam',
              )}
            >
              <meta.icon size={15} aria-hidden />
            </button>
          </MapHtmlMarker>
        );
      })}
    </>
  );
}
