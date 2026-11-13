import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { usePersonalization } from '@/features/interests';
import { useMapFolded, useMapViewport } from '@/features/map';
import {
  areasApi,
  queryKeys,
  type AreaCard,
  type AreasQuery,
  type Layer,
  type PlaceCard,
} from '@/shared/api';
import { boundsContain, boundsToBbox, snapBoundsOutward } from '@/shared/lib/geo';

import { useExploreFilters, type ExploreFilters } from './filtersStore';
import type { NearbyPlace } from './useExplorePlaces';

/** What an area pill counts — and therefore folds: events and issues stay separate pins. */
const FOLDABLE_LAYERS: readonly Layer[] = ['infrastructure', 'tourism'];
const NO_AREAS: readonly AreaCard[] = [];

/**
 * Areas summarise "everything interesting here", so they are shown only while the filters
 * do not narrow places down to something an area cannot represent (a category, an
 * attribute, «бесплатно», «доступная среда») and while at least one layer they count is on.
 * Otherwise matching places are shown one by one, unfolded.
 */
function areasApplicable(filters: ExploreFilters): boolean {
  return (
    filters.categoryIds.length === 0 &&
    Object.keys(filters.attrs).length === 0 &&
    !filters.free &&
    !filters.accessible &&
    FOLDABLE_LAYERS.some((layer) => filters.layers.includes(layer))
  );
}

/**
 * Areas of the explore section: by viewport (or by the search text), the fold predicate for
 * the place layer and the list of places that are not represented by an area right now.
 */
export function useExploreAreas(nearby: readonly NearbyPlace[], activeSearch: string) {
  const filters = useExploreFilters();
  const viewport = useMapViewport();
  const folded = useMapFolded();
  const applicable = areasApplicable(filters);

  const bbox = viewport ? boundsToBbox(snapBoundsOutward(viewport.bounds)) : undefined;
  // Zoomed out, empty territories (many imported from OpenStreetMap) would only clutter the map.
  // `personal_interest` follows the viewer's profile: its key is part of the query key.
  const profile = usePersonalization();
  const params: AreasQuery = {
    ...(activeSearch ? { q: activeSearch } : { bbox, ...(folded && { min_places: 1 }) }),
    topics: profile.topics,
  };
  const query = useQuery({
    queryKey: queryKeys.areas.list(params, profile.key),
    queryFn: ({ signal }) => areasApi.list(params, signal),
    enabled: applicable && profile.ready && (activeSearch !== '' || bbox !== undefined),
    placeholderData: keepPreviousData,
  });

  const areas = applicable ? query.data : undefined;
  const idsKey = areas?.map((area) => area.id).join(',') ?? '';
  const ids = useMemo(() => new Set(idsKey.split(',').filter(Boolean).map(Number)), [idsKey]);
  const fold = useCallback(
    (place: PlaceCard) =>
      FOLDABLE_LAYERS.includes(place.layer) && place.area !== null && ids.has(place.area.id),
    [ids],
  );

  const bounds = viewport?.bounds;
  const visibleAreas = useMemo(
    () =>
      !areas ? [] : activeSearch || !bounds ? areas : areas.filter((a) => boundsContain(bounds, a)),
    [areas, bounds, activeSearch],
  );
  const listedPlaces = useMemo(
    () => (areas && folded && !activeSearch ? nearby.filter(({ place }) => !fold(place)) : nearby),
    [areas, folded, activeSearch, nearby, fold],
  );

  return {
    /** All fetched areas — pass to `useMapAreas` (empty while filters make areas meaningless). */
    areas: areas ?? NO_AREAS,
    /** Areas whose label point is in view (or all search hits), most interesting first. */
    visibleAreas,
    /** Places not folded into an area right now — the list under the areas. */
    listedPlaces,
    /** Pass to `useMapPlaces(…, { fold })` while areas are shown. */
    fold: areas ? fold : undefined,
  };
}

export type ExploreAreas = ReturnType<typeof useExploreAreas>;
