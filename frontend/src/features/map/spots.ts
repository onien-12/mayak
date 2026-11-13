import type { LatLng, LngLat } from '@/shared/lib/geo';

import type { MarkerAnchor } from './sceneStore';

/** About a metre: places this close would be drawn pin over pin. */
const SPOT_DIGITS = 5;

/** Key of the spot a point belongs to — places with the same key share one marker. */
export const spotKey = ({ lat, lng }: LatLng): string =>
  `${lat.toFixed(SPOT_DIGITS)},${lng.toFixed(SPOT_DIGITS)}`;

/** Everything the map has at one point (a venue with a dozen events, a twice-mapped object). */
export interface MapSpot {
  key: string;
  coordinates: LngLat;
  /**
   * The place drawn by its own marker above the clusters: the selected one, otherwise the
   * first recommended one. One per spot — two such pins would hide each other.
   */
  lifted: number | null;
  /** The other places of the spot: an ordinary pin when alone, a count bubble otherwise. */
  rest: readonly MarkerAnchor[];
}

/** Groups marker anchors into spots, keeping the order in which the spots first appear. */
export function groupSpots(
  anchors: readonly MarkerAnchor[],
  selectedId: number | null,
  recommendedIds: ReadonlySet<number>,
): MapSpot[] {
  const groups = new Map<string, { coordinates: LngLat; members: MarkerAnchor[] }>();
  for (const anchor of anchors) {
    const [lng, lat] = anchor.coordinates;
    const key = spotKey({ lat, lng });
    const group = groups.get(key);
    if (group) group.members.push(anchor);
    else groups.set(key, { coordinates: anchor.coordinates, members: [anchor] });
  }
  return [...groups].map(([key, { coordinates, members }]) => {
    const lifted =
      members.find((anchor) => anchor.id === selectedId) ??
      members.find((anchor) => recommendedIds.has(anchor.id));
    return {
      key,
      coordinates,
      lifted: lifted?.id ?? null,
      rest: lifted ? members.filter((anchor) => anchor !== lifted) : members,
    };
  });
}
