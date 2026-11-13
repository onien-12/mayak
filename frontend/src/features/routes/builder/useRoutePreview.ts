import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys, routesApi, type PathPoint, type RoutePreviewInput } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';

import { straightLegs } from '../lib/geometry';
import { previewPoints, type RouteDraft } from './model';

/** ≥ 800 ms: the public OSRM server asks for at most a request a second — preview only settled changes. */
const PREVIEW_DEBOUNCE_MS = 900;

export interface RoutePreviewState {
  /** Line to draw: the server path when it matches the current stops, straight segments otherwise. */
  path: PathPoint[];
  distanceM: number;
  travelMin: number | null;
  /** `legs[i]` — metres between point i and i + 1 (all points, shaping ones included). */
  legs: number[];
  /** True when the numbers are a straight-line estimate (not yet routed, or no road data). */
  estimate: boolean;
  /** The server answered with straight segments although roads were requested. */
  noRoads: boolean;
  pending: boolean;
  failed: boolean;
}

/**
 * Live path and distances for the builder. The backend builds the line on OpenStreetMap data
 * (never the frontend); requests are debounced and cached forever by kind + mode + rounded points, so
 * undoing a change or toggling back costs nothing.
 */
export function useRoutePreview(draft: RouteDraft): RoutePreviewState {
  const points = useMemo(() => previewPoints(draft.stops), [draft.stops]);
  const input: RoutePreviewInput = { kind: draft.kind, path_mode: draft.pathMode, points };
  const inputKey = JSON.stringify(input);
  const settledKey = useDebouncedValue(inputKey, PREVIEW_DEBOUNCE_MS);
  const settled = useMemo(() => JSON.parse(settledKey) as RoutePreviewInput, [settledKey]);

  const query = useQuery({
    queryKey: queryKeys.routes.preview(settled),
    queryFn: () => routesApi.preview(settled),
    enabled: settled.points.length >= 2,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return useMemo(() => {
    const fresh = settledKey === inputKey ? query.data : undefined;
    if (fresh) {
      return {
        path: fresh.path,
        distanceM: fresh.distance_m,
        travelMin: fresh.travel_min,
        legs: fresh.legs_m,
        estimate: false,
        noRoads: fresh.source === 'straight' && draft.pathMode === 'roads',
        pending: false,
        failed: false,
      };
    }
    const legs = straightLegs(points);
    return {
      path: points.map(({ lat, lng }): PathPoint => [lng, lat]),
      distanceM: legs.reduce((sum, leg) => sum + leg, 0),
      travelMin: null,
      legs,
      estimate: true,
      noRoads: false,
      pending: points.length >= 2 && (settledKey !== inputKey || query.isFetching),
      failed: settledKey === inputKey && query.isError,
    };
  }, [settledKey, inputKey, query.data, query.isFetching, query.isError, points, draft.pathMode]);
}
