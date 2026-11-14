import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { placesApi, queryKeys, type PlaceCard, type PlacesPageQuery } from '@/shared/api';

import { useExploreFilters } from './filtersStore';
import { placeFilterParams } from './useExplorePlaces';
import type { ListView } from './useListOrder';

/** Cards per request; «Показать ещё» asks for the next ones. */
export const LIST_PAGE_SIZE = 40;
const NO_PLACES: PlaceCard[] = [];

const coordinate = (value: number) => value.toFixed(5);

/**
 * The places of the «Карта» list: every match city-wide (`GET /places/page`), those in the
 * current map view first, then residents' before imported ones, the nearest first — ordered on
 * the server, loaded a page at a time. The map's own markers still load by viewport.
 */
export function useExploreList(view: ListView, activeSearch: string) {
  const filters = useExploreFilters();
  const { bounds, center } = view;
  const params = placeFilterParams(filters, activeSearch);
  // Bare OpenStreetMap objects stay out unless asked for, exactly as on the map (SPEC §18).
  const showBackground =
    filters.includeUnnamed || activeSearch !== '' || filters.categoryIds.length > 0;
  const query: PlacesPageQuery = {
    ...params,
    view:
      bounds &&
      [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat].map(coordinate).join(','),
    center: center && `${coordinate(center.lat)},${coordinate(center.lng)}`,
    background: showBackground ? 'show' : 'hide',
    limit: LIST_PAGE_SIZE,
  };
  const hasLayers = (params.layers?.length ?? 0) > 0;

  const list = useInfiniteQuery({
    queryKey: queryKeys.places.page(query),
    queryFn: ({ pageParam, signal }) => placesApi.page({ ...query, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
    enabled: hasLayers && (bounds !== undefined || activeSearch !== ''),
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => {
    if (!list.data) return NO_PLACES;
    const seen = new Set<number>();
    return list.data.pages
      .flatMap((page) => page.items)
      .filter((place) => !seen.has(place.id) && Boolean(seen.add(place.id)));
  }, [list.data]);
  const first = list.data?.pages[0];

  return {
    /** Loaded so far, in order; the first `inView` of them are in the map view. */
    items,
    total: first?.total ?? 0,
    inView: first?.in_view ?? 0,
    hasMore: list.hasNextPage,
    loadMore: () => void list.fetchNextPage(),
    isLoadingMore: list.isFetchingNextPage,
    isLoading: hasLayers && list.isPending,
    isRefreshing: list.isFetching && !list.isPending && !list.isFetchingNextPage,
    isError: list.isError,
    error: list.error,
    refetch: () => void list.refetch(),
  };
}

export type ExploreList = ReturnType<typeof useExploreList>;
