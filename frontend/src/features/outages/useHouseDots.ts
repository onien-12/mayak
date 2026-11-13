import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useMapViewport, type MapDot } from '@/features/map';
import { outagesApi, queryKeys, type OutageBuildingPoint, type OutageResource } from '@/shared/api';
import { boundsToBbox, snapBoundsOutward } from '@/shared/lib/geo';
import { OUTAGE_RESOURCE_META } from '@/shared/lib/labels';

/** Below this zoom house dots are noise — they are neither drawn nor requested. */
export const HOUSE_DOTS_MIN_ZOOM = 12.5;
/** Houses with several outages at once: navy, drawn larger. */
const MIXED_COLOR = '#0B2A4A';

export interface HouseDots {
  single: MapDot[];
  mixed: MapDot[];
  byAddress: Map<string, OutageBuildingPoint>;
}

/**
 * Houses with current outages inside the visible map area (`GET /outages/buildings`).
 * The bbox is snapped to a grid and the viewport is already debounced, so panning reuses
 * cached responses instead of refetching on every move.
 */
export function useHouseDots(resource: OutageResource | null): HouseDots {
  const viewport = useMapViewport();
  const visible = viewport !== null && viewport.zoom >= HOUSE_DOTS_MIN_ZOOM;
  const query = {
    bbox: viewport ? boundsToBbox(snapBoundsOutward(viewport.bounds)) : '',
    resource: resource ? [resource] : undefined,
  };

  const houses = useQuery({
    queryKey: queryKeys.outages.buildings(query),
    queryFn: ({ signal }) => outagesApi.buildings(query, signal),
    enabled: visible,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const single: MapDot[] = [];
    const mixed: MapDot[] = [];
    const byAddress = new Map<string, OutageBuildingPoint>();
    for (const house of houses.data ?? []) {
      byAddress.set(house.address, house);
      const [first] = house.resources;
      const dot = { id: house.address, lat: house.lat, lng: house.lng };
      if (house.resources.length > 1 || !first) mixed.push({ ...dot, color: MIXED_COLOR });
      else single.push({ ...dot, color: OUTAGE_RESOURCE_META[first].color });
    }
    return { single, mixed, byAddress };
  }, [houses.data]);
}
