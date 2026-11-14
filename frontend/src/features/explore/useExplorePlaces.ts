import { keepPreviousData, useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useMap, useMapFolded, useMapViewport } from '@/features/map';
import { placesApi, queryKeys, type PlaceCard, type PlacesQuery } from '@/shared/api';
import { useCategories, useDebouncedValue } from '@/shared/hooks';
import { boundsToBbox, snapBoundsOutward } from '@/shared/lib/geo';
import { isBareBackground, isUnconfirmedOsm } from '@/shared/lib/osm';

import { MAP_LAYERS, useExploreFilters, type ExploreFilters } from './filtersStore';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;
const NO_PLACES: PlaceCard[] = [];

/** The filters of the section as request parameters — shared by the markers and the list. */
export function placeFilterParams(filters: ExploreFilters, search: string) {
  const attrs = Object.entries(filters.attrs).map(([key, value]) => `${key}:${value}`);
  if (filters.free) attrs.push('free:true');
  if (filters.accessible) attrs.push('accessible:true');

  return {
    q: search || undefined,
    // Always named: the server's default is every layer, and the map shows places only — a
    // search finds no events or problems here either.
    layers: filters.layers.filter((layer) => MAP_LAYERS.includes(layer)),
    categories: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
    min_status: filters.minStatus === 'any' ? undefined : filters.minStatus,
    attrs: attrs.length > 0 ? attrs : undefined,
  } satisfies PlacesQuery;
}

function buildQuery(
  filters: ExploreFilters,
  search: string,
  bbox: string | undefined,
): PlacesQuery {
  return { ...placeFilterParams(filters, search), bbox: search ? undefined : bbox };
}

/**
 * The requests behind the map. Zoomed out, the OpenStreetMap base layer (thousands of
 * playgrounds and sports grounds) would fill the server's `limit` — most trusted first — and
 * push residents' new, still unconfirmed places out, so the city view asks for community
 * content only; OSM objects come in from `PLACE_UNFOLD_ZOOM` (and their areas count them
 * meanwhile). A search or a category filter asks for everything.
 */
function placeQueries(params: PlacesQuery, cityView: boolean): PlacesQuery[] {
  return cityView ? [{ ...params, origin: 'community' }] : [params];
}

/** One result for the split requests; module-level so it re-runs only when they change. */
function combinePlaceQueries(results: UseQueryResult<PlaceCard[]>[]) {
  return {
    data: results.every((result) => result.data)
      ? results.flatMap((result) => result.data ?? [])
      : undefined,
    isPending: results.some((result) => result.isPending),
    isFetching: results.some((result) => result.isFetching),
    isError: results.some((result) => result.isError),
    error: results.find((result) => result.error)?.error ?? null,
    refetch: () => Promise.all(results.map((result) => result.refetch())),
  };
}

/**
 * The markers of the explore section: everything matching the filters around the current
 * viewport. A text search looks through the whole city instead of the viewport. The list under
 * the map is the city-wide `useExploreList`.
 */
export type ExploreResults = ReturnType<typeof useExplorePlaces>;

export function useExplorePlaces() {
  const filters = useExploreFilters();
  const search = useDebouncedValue(filters.search.trim(), SEARCH_DEBOUNCE_MS);
  const activeSearch = search.length >= MIN_SEARCH_LENGTH ? search : '';
  const viewport = useMapViewport();
  const { status } = useMap();

  const bbox = viewport ? boundsToBbox(snapBoundsOutward(viewport.bounds)) : undefined;
  const params = buildQuery(filters, activeSearch, bbox);
  const hasLayers = params.layers !== undefined && params.layers.length > 0;

  // «Всё из OpenStreetMap» asks for the base layer at any zoom, like a search or a category does.
  const cityView =
    useMapFolded() && !activeSearch && filters.categoryIds.length === 0 && !filters.includeUnnamed;
  const trustedOnly = filters.minStatus !== 'any';
  const enabled = hasLayers && (bbox !== undefined || activeSearch !== '' || status !== 'loading');

  const query = useQueries({
    queries: placeQueries(params, cityView).map((request) => ({
      queryKey: queryKeys.places.list(request),
      queryFn: ({ signal }: { signal: AbortSignal }) => placesApi.list(request, signal),
      enabled,
      placeholderData: keepPreviousData,
    })),
    combine: combinePlaceQueries,
  });

  // No layers — nothing to draw: an empty list clears the map, `undefined` would keep the last markers.
  const data = hasLayers ? query.data : NO_PLACES;
  // Bare OpenStreetMap objects (nameless yard playgrounds, lone monuments without a photo) stay
  // out unless asked for: by their category, by a search or by the «Всё из OpenStreetMap» filter.
  const { byId } = useCategories();
  const { includeUnnamed, categoryIds } = filters;
  const places = useMemo(
    () =>
      data?.filter((place) => {
        if (!isUnconfirmedOsm(place)) return true;
        if (trustedOnly) return false;
        if (includeUnnamed || activeSearch || categoryIds.includes(place.category_id)) return true;
        return !isBareBackground(place, byId.get(place.category_id)?.name);
      }),
    [data, trustedOnly, includeUnnamed, activeSearch, categoryIds, byId],
  );
  return {
    /** All fetched places — pass to `useMapPlaces`. */
    places,
    activeSearch,
    hasLayers,
    isLoading: hasLayers && query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
