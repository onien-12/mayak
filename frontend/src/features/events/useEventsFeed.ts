import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useMapViewport, useUserLocation } from '@/features/map';
import { eventsApi, queryKeys, type EventsQuery, type PlaceCard } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import type { LatLng } from '@/shared/lib/geo';

import { useEventsFilters, type EventsFilters } from './filtersStore';
import { periodBounds } from './period';

export const EVENTS_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;
/** ≈ 1 km: the distance sort is not refetched on every small map move. */
const ORIGIN_PRECISION = 100;
/** ≈ 100 m: a radius of a kilometre needs a finer origin than the sort does. */
const RADIUS_ORIGIN_PRECISION = 1000;

const roundCoord = (value: number, precision: number) => Math.round(value * precision) / precision;

function buildQuery(filters: EventsFilters, search: string, origin: LatLng | null): EventsQuery {
  const radius = filters.radiusKm !== null && origin !== null;
  const distance = filters.sort === 'distance' && origin !== null;
  const precision = radius ? RADIUS_ORIGIN_PRECISION : ORIGIN_PRECISION;
  return {
    scope: filters.past ? 'past' : undefined,
    ...periodBounds(
      filters.past && filters.time !== 'custom' ? { time: 'any', range: null } : filters,
    ),
    categories: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
    q: search || undefined,
    meetups: filters.kind === 'meetups' ? 'only' : filters.kind === 'city' ? 'exclude' : undefined,
    origin: filters.origin === 'all' ? undefined : filters.origin,
    free: filters.free || undefined,
    sort:
      filters.sort === 'start' || (filters.sort === 'distance' && !distance)
        ? undefined
        : filters.sort,
    lat: distance || radius ? roundCoord(origin.lat, precision) : undefined,
    lng: distance || radius ? roundCoord(origin.lng, precision) : undefined,
    radius_m: radius ? (filters.radiusKm ?? 0) * 1000 : undefined,
  };
}

export type EventsFeed = ReturnType<typeof useEventsFeed>;

/**
 * The afisha feed for the current filters, loaded page by page (`limit` / `offset`).
 * «Рядом» and the radius filter measure from the user, or from the map centre when the location
 * is unknown.
 */
export function useEventsFeed() {
  const filters = useEventsFilters();
  const search = useDebouncedValue(filters.search.trim(), SEARCH_DEBOUNCE_MS);
  const activeSearch = search.length >= MIN_SEARCH_LENGTH ? search : '';
  const { location } = useUserLocation();
  const viewport = useMapViewport();
  const origin = location?.point ?? viewport?.center ?? null;
  const query = buildQuery(filters, activeSearch, origin);

  const feed = useInfiniteQuery({
    queryKey: queryKeys.events.feed(query),
    queryFn: ({ pageParam, signal }) =>
      eventsApi.list({ ...query, limit: EVENTS_PAGE_SIZE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < EVENTS_PAGE_SIZE ? undefined : pages.length * EVENTS_PAGE_SIZE,
    placeholderData: keepPreviousData,
  });

  const events = useMemo<PlaceCard[] | undefined>(() => {
    if (!feed.data) return undefined;
    const seen = new Set<number>();
    return feed.data.pages.flat().filter((place) => {
      if (seen.has(place.id)) return false;
      seen.add(place.id);
      return true;
    });
  }, [feed.data]);

  return {
    events,
    activeSearch,
    /** Where distances are measured from (only when sorting by distance or within a radius). */
    distanceOrigin: filters.sort === 'distance' || filters.radiusKm !== null ? origin : null,
    isLoading: feed.isPending,
    isRefreshing: feed.isFetching && !feed.isPending && !feed.isFetchingNextPage,
    isError: feed.isError,
    error: feed.error,
    refetch: feed.refetch,
    hasMore: feed.hasNextPage,
    loadMore: feed.fetchNextPage,
    isLoadingMore: feed.isFetchingNextPage,
  };
}
