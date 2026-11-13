import { useEffect, useEffectEvent, useRef } from 'react';

import { useMapActions, useMapViewport } from '@/features/map';
import { boundsContain, boundsOfPoints, type LatLng } from '@/shared/lib/geo';

const MAX_FIT_ZOOM = 14;

/**
 * On entering the section (once, not on every refetch): if none of the outages is in view —
 * e.g. the map was left on Russky island — frames the part of the city that has them.
 * Otherwise the user's viewport is kept.
 */
export function useEntryFrame(points: readonly LatLng[] | undefined): void {
  const { fitBounds, ready } = useMapActions();
  const viewport = useMapViewport();
  const hasViewport = viewport !== null;
  const decided = useRef(false);

  const decide = useEffectEvent((outages: readonly LatLng[]) => {
    decided.current = true;
    if (!viewport || outages.some((point) => boundsContain(viewport.bounds, point))) return;
    const bounds = boundsOfPoints(outages);
    if (bounds) fitBounds(bounds, { maxZoom: MAX_FIT_ZOOM });
  });

  useEffect(() => {
    if (!decided.current && ready && hasViewport && points) decide(points);
  }, [ready, hasViewport, points]);
}
