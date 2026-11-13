import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  outagesApi,
  placesApi,
  queryKeys,
  type IssueBrief,
  type OutageBrief,
  type OutageResource,
  type PlaceCard,
  type PlaceDetail,
  type PlacesQuery,
} from '@/shared/api';

const REFRESH_MS = 10 * 60_000;
const OUTAGE_PLACES: PlacesQuery = { layers: ['issue'], origin: 'external' };

/** `GET /outages/summary` — totals of the current outages. */
export function useOutageSummary() {
  return useQuery({
    queryKey: queryKeys.outages.summary,
    queryFn: outagesApi.summary,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
  });
}

/** An issue place that is an imported utility outage. */
export interface OutagePlace extends PlaceCard {
  issue: IssueBrief & { outage: OutageBrief };
}

const isOutage = (place: PlaceCard): place is OutagePlace => Boolean(place.issue?.outage);

/**
 * Current outages (imported issue places with `issue.outage`), most houses first, and the
 * ones of the selected resource. Details (start, planned end, organisation) are loaded per
 * outage — the list shows them and the card opens instantly.
 */
export function useOutageList(resource: OutageResource | null) {
  const places = useQuery({
    queryKey: queryKeys.places.list(OUTAGE_PLACES),
    queryFn: ({ signal }) => placesApi.list(OUTAGE_PLACES, signal),
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
  });

  const outages = useMemo(
    () =>
      (places.data ?? [])
        .filter(isOutage)
        .sort((a, b) => b.issue.outage.buildings_count - a.issue.outage.buildings_count),
    [places.data],
  );
  const filtered = useMemo(
    () =>
      resource ? outages.filter((place) => place.issue.outage.resource === resource) : outages,
    [outages, resource],
  );

  const details = useOutageDetails(filtered.map(({ id }) => id));

  return {
    outages,
    filtered,
    details,
    isPending: places.isPending,
    isError: places.isError,
    error: places.error,
    refetch: places.refetch,
  };
}

/** Details (start, planned end, organisation) of the given outages, by id. */
export function useOutageDetails(ids: readonly number[]): ReadonlyMap<number, PlaceDetail> {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.places.detail(id),
      queryFn: () => placesApi.get(id),
      staleTime: REFRESH_MS,
    })),
    combine: (results) => {
      const byId = new Map<number, PlaceDetail>();
      for (const result of results) if (result.data) byId.set(result.data.id, result.data);
      return byId;
    },
  });
}
