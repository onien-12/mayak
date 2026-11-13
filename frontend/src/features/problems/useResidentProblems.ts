import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useMapViewport } from '@/features/map';
import { placesApi, queryKeys, type PlaceCard, type PlacesQuery } from '@/shared/api';
import { boundsContain, boundsToBbox, snapBoundsOutward } from '@/shared/lib/geo';

import { useProblemFilters } from './filtersStore';

/** The latest sign of life: a confirmation by a neighbour, else the report itself. */
export function lastActivity(place: PlaceCard): string {
  const confirmed = place.last_confirmed_at;
  return confirmed && confirmed > place.created_at ? confirmed : place.created_at;
}

const isSolved = (place: PlaceCard) => place.issue?.stage === 'resolved';

/** Open problems first, solved ones at the end; the freshest first within each. */
function openAndFreshFirst(a: PlaceCard, b: PlaceCard): number {
  const solved = Number(isSolved(a)) - Number(isSolved(b));
  if (solved !== 0) return solved;
  return lastActivity(b).localeCompare(lastActivity(a));
}

/**
 * Problems reported by residents (`issue` places without an import source) around the current
 * viewport — imported outages have their own view. Solved ones are asked for too and sink to
 * the end. The category filter goes to the server, the stage filter is applied here.
 * `places` — everything loaded (for the map), `visible` — the part actually in view (for the list).
 */
export function useResidentProblems(enabled: boolean) {
  const { categoryIds, stages } = useProblemFilters();
  const viewport = useMapViewport();
  const bbox = viewport ? boundsToBbox(snapBoundsOutward(viewport.bounds)) : undefined;
  const params: PlacesQuery = {
    bbox,
    layers: ['issue'],
    origin: 'community',
    include_resolved: true,
    categories: categoryIds.length > 0 ? categoryIds : undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.places.list(params),
    queryFn: ({ signal }) => placesApi.list(params, signal),
    enabled: enabled && bbox !== undefined,
    placeholderData: keepPreviousData,
  });

  const places = useMemo(
    () =>
      query.data
        ?.filter(
          (place) => stages.length === 0 || stages.includes(place.issue?.stage ?? 'detected'),
        )
        .sort(openAndFreshFirst),
    [query.data, stages],
  );
  const bounds = viewport?.bounds;
  const visible = useMemo(
    () => (places && bounds ? places.filter((place) => boundsContain(bounds, place)) : places),
    [places, bounds],
  );

  return {
    places,
    visible,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export type ResidentProblems = ReturnType<typeof useResidentProblems>;
