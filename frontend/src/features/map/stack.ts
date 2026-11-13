import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { PlaceCard } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

import { useSceneStore } from './sceneStore';
import { spotKey } from './spots';
import { parsePoint } from './tap';

const STACK_PARAM = 'stack';
/** Cards a newly opened stack replaces: the place card and the spot sheet. */
const REPLACED_PARAMS = ['place', 'at', 'obj'] as const;

/**
 * The `?stack=<lat>,<lng>` URL state: the list of places that share one point on the map
 * (a venue with several events), opened by a tap on their bubble. A place opened from the
 * list keeps the parameter, so closing the place returns to the list.
 */
export function useStackParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const point = parsePoint(searchParams.get(STACK_PARAM));
  const stackKey = point ? spotKey(point) : null;

  const openStack = useCallback(
    (at: LatLng) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const param of REPLACED_PARAMS) next.delete(param);
        next.set(STACK_PARAM, spotKey(at));
        return next;
      });
    },
    [setSearchParams],
  );

  const closeStack = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(STACK_PARAM);
      return next;
    });
  }, [setSearchParams]);

  return { stackKey, openStack, closeStack };
}

/** The places of the open stack, as the map currently draws them (empty when none is open). */
export function useMapStack(): { places: readonly PlaceCard[]; closeStack: () => void } {
  const { stackKey, closeStack } = useStackParam();
  const shown = useSceneStore((state) => state.places);
  const places = useMemo(
    () => (stackKey ? shown.filter((place) => spotKey(place) === stackKey) : []),
    [shown, stackKey],
  );
  return { places, closeStack };
}
