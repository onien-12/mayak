import { useEffect, useEffectEvent } from 'react';

import { useMapActions } from '@/features/map';
import type { PlaceCard } from '@/shared/api';
import { boundsOfPoints } from '@/shared/lib/geo';

const MAX_FIT_ZOOM = 16;
const FIT_PADDING = 72;

/** Fits the map to the given places once per `key` (e.g. when a collection opens). */
export function useFitPlaces(key: number, places: readonly PlaceCard[] | undefined) {
  const { fitBounds, ready } = useMapActions();
  const hasPlaces = (places?.length ?? 0) > 0;

  const fit = useEffectEvent(() => {
    const bounds = places ? boundsOfPoints(places) : null;
    if (bounds) fitBounds(bounds, { maxZoom: MAX_FIT_ZOOM, padding: FIT_PADDING });
  });

  useEffect(() => {
    if (ready && hasPlaces) fit();
  }, [key, ready, hasPlaces]);
}
