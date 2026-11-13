import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  fetchMapObject,
  type GeocodeLevel,
  queryKeys,
  reverseGeocode,
  suggestAddresses,
  SUGGEST_MIN_LENGTH,
  TWOGIS_KEY,
} from '../api';
import type { LatLng } from '../lib/geo';
import { useDebouncedValue } from './useDebouncedValue';

const SUGGEST_DEBOUNCE_MS = 600;

/**
 * 2GIS address suggestions for a free-text query. Quota-aware: ≥ 3 characters,
 * 600 ms debounce, results cached for the whole session.
 */
export function useAddressSuggest(input: string, near: LatLng, enabled = true) {
  const query = useDebouncedValue(input.trim(), SUGGEST_DEBOUNCE_MS);
  const active = enabled && Boolean(TWOGIS_KEY) && query.length >= SUGGEST_MIN_LENGTH;

  const result = useQuery({
    queryKey: queryKeys.geo.suggest(query.toLowerCase()),
    queryFn: ({ signal }) => suggestAddresses(query, near, signal),
    enabled: active,
    staleTime: Infinity,
    gcTime: Infinity,
    placeholderData: keepPreviousData,
  });

  return { suggestions: active ? (result.data ?? []) : [], isFetching: result.isFetching };
}

/**
 * Address of a confirmed point (`level: 'area'` — street / district instead, see
 * `GeocodeLevel`). Pass `null` while the pin is still moving — the geocoder is called once
 * per confirmed position (rounded to ~10 m) and cached forever.
 */
export function useReverseGeocode(point: LatLng | null, level: GeocodeLevel = 'address') {
  const lat = point ? Number(point.lat.toFixed(4)) : 0;
  const lng = point ? Number(point.lng.toFixed(4)) : 0;

  return useQuery({
    queryKey: queryKeys.geo.reverse(lat, lng, level),
    queryFn: ({ signal }) => reverseGeocode({ lat, lng }, signal, level),
    enabled: point !== null && Boolean(TWOGIS_KEY),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Name and address of a tapped 2GIS object (id from `useMapTap`). One request per object
 * id, cached forever; `data` is `null` when the catalog does not know the object.
 */
export function useMapObject(objectId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.geo.object(objectId ?? ''),
    queryFn: ({ signal }) => fetchMapObject(objectId ?? '', signal),
    enabled: Boolean(objectId) && Boolean(TWOGIS_KEY),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
