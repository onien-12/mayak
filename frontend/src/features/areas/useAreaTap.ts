import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAreaParam, type MapTap } from '@/features/map';
import { areasApi, queryKeys, type AreaDetail } from '@/shared/api';

const OBJECT_AREA_STALE_MS = 10 * 60_000;

/**
 * Tap routing for the base map: a tapped 2GIS object linked to an area opens the area
 * card; anything else goes to `fallback` (the spot sheet). Known links come from the area
 * details already in the cache, then from `GET /areas?object_id=` cached per object
 * (area cards carry no `object_id`, so the viewport list cannot answer this).
 */
export function useAreaAwareTap(fallback: (tap: MapTap) => void): (tap: MapTap) => void {
  const queryClient = useQueryClient();
  const { openArea } = useAreaParam();

  return useCallback(
    (tap: MapTap) => {
      const { objectId } = tap;
      if (!objectId) {
        fallback(tap);
        return;
      }
      const cached = queryClient
        .getQueriesData<AreaDetail>({ queryKey: queryKeys.areas.details })
        .find(([, area]) => area?.object_id === objectId)?.[1];
      if (cached) {
        openArea(cached.id);
        return;
      }
      queryClient
        .fetchQuery({
          queryKey: queryKeys.areas.byObject(objectId),
          queryFn: async () => (await areasApi.list({ object_id: objectId, limit: 1 }))[0] ?? null,
          staleTime: OBJECT_AREA_STALE_MS,
        })
        .then(
          (area) => (area ? openArea(area.id) : fallback(tap)),
          () => fallback(tap),
        );
    },
    [queryClient, openArea, fallback],
  );
}
