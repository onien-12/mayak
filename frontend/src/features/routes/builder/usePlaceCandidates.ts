import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useMapViewport } from '@/features/map';
import { placesApi, queryKeys, type Layer, type PlacesQuery } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import { boundsToBbox, snapBoundsOutward } from '@/shared/lib/geo';

/** Map places that make sense as route stops: sights and city infrastructure. */
const CANDIDATE_LAYERS: Layer[] = ['tourism', 'infrastructure'];
const SEARCH_DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;
const SEARCH_LIMIT = 6;

/** Places around the visible map, drawn as pins to pick stops from (only while `enabled`). */
export function usePlaceCandidates(enabled: boolean) {
  const viewport = useMapViewport();
  const bbox = viewport ? boundsToBbox(snapBoundsOutward(viewport.bounds)) : undefined;
  const params: PlacesQuery = { bbox, layers: CANDIDATE_LAYERS };

  return useQuery({
    queryKey: queryKeys.places.list(params),
    queryFn: ({ signal }) => placesApi.list(params, signal),
    enabled: enabled && bbox !== undefined,
    placeholderData: keepPreviousData,
  });
}

/** Places matching a typed name anywhere in the city. */
export function usePlaceSearch(text: string) {
  const typed = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const q = typed.length >= MIN_SEARCH_LENGTH ? typed : '';
  const params: PlacesQuery = { q, layers: CANDIDATE_LAYERS, limit: SEARCH_LIMIT };

  return useQuery({
    queryKey: queryKeys.places.list(params),
    queryFn: ({ signal }) => placesApi.list(params, signal),
    enabled: q !== '',
    placeholderData: keepPreviousData,
  });
}
