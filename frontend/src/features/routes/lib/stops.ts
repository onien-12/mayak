import type { RouteDetail, RouteStop } from '@/shared/api';
import { formatDistance, formatDuration } from '@/shared/lib/format';

/** A stop as the traveller sees it: numbered, with the way from the previous visible stop. */
export interface NumberedStop {
  stop: RouteStop;
  /** 1-based number among visible (non-`via`) stops. */
  number: number;
  /** Along the path from the previous numbered stop (shaping points summed); `null` for the first. */
  legM: number | null;
  /** Travel minutes for that leg, proportional to the route's travel time. */
  legMin: number | null;
}

/** Visible stops of a route with distances that skip the invisible `via` points. */
export function numberStops(
  route: Pick<RouteDetail, 'stops' | 'distance_m' | 'travel_min'>,
): NumberedStop[] {
  const result: NumberedStop[] = [];
  let pending = 0;
  for (const stop of route.stops) {
    pending += stop.distance_from_prev_m ?? 0;
    if (stop.kind === 'via') continue;
    const first = result.length === 0;
    result.push({
      stop,
      number: result.length + 1,
      legM: first ? null : pending,
      legMin: first ? null : legMinutes(pending, route.distance_m, route.travel_min),
    });
    pending = 0;
  }
  return result;
}

/** Travel time of a part of the route, proportional to the whole route's speed. */
export function legMinutes(legM: number, totalM: number, totalMin: number): number {
  if (totalM <= 0) return 0;
  return (totalMin * legM) / totalM;
}

/** «через 450 м · ~6 мин». */
export function legLabel(legM: number, legMin: number): string {
  return `через ${formatDistance(legM)} · ~${formatDuration(legMin)}`;
}
