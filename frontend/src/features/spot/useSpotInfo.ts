import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { MapTap } from '@/features/map';
import { outagesApi, queryKeys, type OutageBuildingPoint } from '@/shared/api';
import { useMapObject, useReverseGeocode } from '@/shared/hooks';
import { boundsToBbox, haversine, type LatLng } from '@/shared/lib/geo';

export interface SpotInfo {
  /** Object name («ГУМ») or the address of the point; `null` when nothing is known. */
  title: string | null;
  /** Address under the name, when it adds something to the title. */
  address: string | null;
  isResolving: boolean;
}

/**
 * Name and address of the tapped spot with exactly one 2GIS lookup per tap (SPEC §13):
 * `items/byid` when a map object was tapped, reverse geocoding otherwise. Both are cached
 * for the session; failures degrade to `knownName` (the object name stored with its notes),
 * then to plain coordinates.
 */
export function useSpotInfo(spot: MapTap, knownName: string | null): SpotInfo {
  const object = useMapObject(spot.objectId);
  const geocode = useReverseGeocode(spot.objectId ? null : spot);

  if (spot.objectId) {
    const name = object.data?.name ?? knownName;
    const address = object.data?.address ?? null;
    return {
      title: name,
      address: address && address !== name ? address : null,
      isResolving: object.isLoading,
    };
  }
  return { title: geocode.data ?? knownName, address: null, isResolving: geocode.isLoading };
}

/** Houses within this distance of the tap count as "the tapped house". */
const OUTAGE_MATCH_M = 45;
const METERS_PER_DEGREE = 111_320;
const OUTAGE_STALE_MS = 5 * 60_000;

function boxAround(point: LatLng, meters: number): string {
  const dLat = meters / METERS_PER_DEGREE;
  const dLng = meters / (METERS_PER_DEGREE * Math.cos((point.lat * Math.PI) / 180));
  const round = (value: number) => Number(value.toFixed(5));
  return boundsToBbox({
    minLng: round(point.lng - dLng),
    minLat: round(point.lat - dLat),
    maxLng: round(point.lng + dLng),
    maxLat: round(point.lat + dLat),
  });
}

/**
 * Current utility outage at the tapped house. Uses `GET /outages/buildings` with a tiny
 * bbox around the point: it is coordinate-based (VL.ru gives exact house coordinates), so
 * it works before — and without — the 2GIS address lookup and does not depend on how the
 * address is spelled, unlike the free-text `/outages/check`.
 */
export function useSpotOutage({ lat, lng }: LatLng): OutageBuildingPoint | null {
  const bbox = boxAround({ lat, lng }, OUTAGE_MATCH_M);
  const { data } = useQuery({
    queryKey: queryKeys.outages.buildings({ bbox }),
    queryFn: ({ signal }) => outagesApi.buildings({ bbox }, signal),
    staleTime: OUTAGE_STALE_MS,
    retry: false,
  });

  return useMemo(() => {
    let best: OutageBuildingPoint | null = null;
    let bestDistance = OUTAGE_MATCH_M;
    for (const house of data ?? []) {
      const distance = haversine({ lat, lng }, house);
      if (distance <= bestDistance) {
        best = house;
        bestDistance = distance;
      }
    }
    return best;
  }, [data, lat, lng]);
}
