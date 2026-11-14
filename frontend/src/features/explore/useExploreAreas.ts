import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { usePersonalization } from '@/features/interests';
import { useMapFolded } from '@/features/map';
import {
  areasApi,
  queryKeys,
  type AreaCard,
  type AreasQuery,
  type Layer,
  type PlaceCard,
} from '@/shared/api';
import { boundsContain, haversine } from '@/shared/lib/geo';

import { useExploreFilters, type ExploreFilters } from './filtersStore';
import type { ListView } from './useListOrder';

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

const startOf = (area: AreaCard) => area.next_community_event?.starts_at ?? '';

/** Locations with a residents' upcoming event inside lead, the soonest first. */
function withResidentsEventsFirst(areas: readonly AreaCard[]): AreaCard[] {
  const withEvents = areas
    .filter((area) => area.next_community_event)
    .sort((a, b) => startOf(a).localeCompare(startOf(b)));
  return [...withEvents, ...areas.filter((area) => !area.next_community_event)];
}

/**
 * Areas of the explore section, city-wide (or the search hits): the ones drawn on the map, the
 * fold predicate for the place layer, and the list — those in the list's view first (residents'
 * events first, then the most interesting), then the rest (residents' events first, then the
 * nearest to the centre).
 */
export function useExploreAreas(view: ListView, activeSearch: string) {
  const filters = useExploreFilters();
  const folded = useMapFolded();
  const applicable = areasApplicable(filters);

  // `personal_interest` follows the viewer's profile: its key is part of the query key.
  const profile = usePersonalization();
  const params: AreasQuery = { ...(activeSearch && { q: activeSearch }), topics: profile.topics };
  const query = useQuery({
    queryKey: queryKeys.areas.list(params, profile.key),
    queryFn: ({ signal }) => areasApi.list(params, signal),
    enabled: applicable && profile.ready,
    placeholderData: keepPreviousData,
  });

  // Small OpenStreetMap territories nobody has made anything in stay out unless asked for: by a
  // search or by «Всё из OpenStreetMap», like bare background places (SPEC §18). Neither listed
  // nor drawn; a direct link still opens the card.
  const showBare = filters.includeUnnamed || activeSearch !== '';
  const fetched = applicable ? query.data : undefined;
  const listed = useMemo(
    () => (showBare ? fetched : fetched?.filter((area) => !area.bare_background)),
    [fetched, showBare],
  );
  // Zoomed out, empty territories would only clutter the map; the list keeps them.
  const areas = useMemo(
    () => (folded && listed ? listed.filter((area) => area.places_count > 0) : listed),
    [folded, listed],
  );
  const idsKey = areas?.map((area) => area.id).join(',') ?? '';
  const ids = useMemo(() => new Set(idsKey.split(',').filter(Boolean).map(Number)), [idsKey]);
  const fold = useCallback(
    (place: PlaceCard) =>
      FOLDABLE_LAYERS.includes(place.layer) && place.area !== null && ids.has(place.area.id),
    [ids],
  );

  const { bounds, center } = view;
  const groups = useMemo(() => {
    const all = listed ?? NO_AREAS;
    const inView = bounds ? all.filter((area) => boundsContain(bounds, area)) : [];
    const distance = (area: AreaCard) => (center ? haversine(center, area) : 0);
    const rest = all
      .filter((area) => !inView.includes(area))
      .sort((a, b) => distance(a) - distance(b));
    return { inView: withResidentsEventsFirst(inView), rest: withResidentsEventsFirst(rest) };
  }, [listed, bounds, center]);

  return {
    /** Areas drawn on the map — pass to `useMapAreas` (empty while filters make areas meaningless). */
    areas: areas ?? NO_AREAS,
    /** Listed areas whose label point is in the list's view, residents' events first. */
    inView: groups.inView,
    /** The other listed areas, residents' events first, then the nearest. */
    rest: groups.rest,
    /** Pass to `useMapPlaces(…, { fold })` while areas are shown. */
    fold: areas ? fold : undefined,
  };
}

export type ExploreAreas = ReturnType<typeof useExploreAreas>;
