import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { areasApi, queryKeys, type AreaCard } from '@/shared/api';
import { boundsToBbox, type LatLng } from '@/shared/lib/geo';
import { pointInPolygon, polygonAreaM2 } from '@/shared/lib/polygon';

/** Half-size of the box searched around the point, degrees (≈ 1 km). */
const AROUND_DEG = 0.01;

/** Areas near a point: those containing it (smallest territory first) and the others. */
export function useAreasAround(point: LatLng) {
  const bbox = boundsToBbox({
    minLng: Number((point.lng - AROUND_DEG).toFixed(4)),
    minLat: Number((point.lat - AROUND_DEG).toFixed(4)),
    maxLng: Number((point.lng + AROUND_DEG).toFixed(4)),
    maxLat: Number((point.lat + AROUND_DEG).toFixed(4)),
  });
  const query = useQuery({
    queryKey: queryKeys.areas.list({ bbox }),
    queryFn: ({ signal }) => areasApi.list({ bbox }, signal),
    placeholderData: keepPreviousData,
  });

  return useMemo(() => {
    const areas = query.data ?? [];
    const containing: AreaCard[] = areas
      .filter((area) => pointInPolygon(point, area.geometry))
      .map((area) => ({ area, size: polygonAreaM2(area.geometry) }))
      .sort((a, b) => a.size - b.size)
      .map(({ area }) => area);
    const nearby = areas.filter((area) => !containing.includes(area));
    return {
      /** What the server will pick automatically: the smallest area containing the point. */
      detected: containing[0] ?? null,
      containing,
      nearby,
      isLoading: query.isPending,
    };
  }, [query.data, query.isPending, point]);
}
