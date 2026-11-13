import { haversine, type LatLng } from '@/shared/lib/geo';

const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const TILE_PX = 256;
/** Space between neighbouring pins of a spread group, px. */
const SPREAD_GAP_PX = 4;
/** Pins closer than this share of their size hide each other's number; a small overlap is fine. */
const OVERLAP_SHARE = 0.7;

export interface SpreadPin {
  /** Where the marker stands: the stop itself, or the centre of its overlapping group. */
  position: LatLng;
  /** Horizontal shift of the pin from `position`, px. */
  dx: number;
}

function metresPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_PX * 2 ** zoom);
}

/**
 * Stops whose pins would overlap at this zoom (e.g. «Ворошиловская батарея» and «Последняя
 * вода» 50 m apart) are drawn side by side, in visiting order, around the centre of their
 * group; zooming in far enough separates them again. Without a zoom nothing is spread.
 */
export function spreadPins(
  points: readonly LatLng[],
  zoom: number | undefined,
  pinPx: number,
): SpreadPin[] {
  const first = points[0];
  if (zoom === undefined || !first) return points.map((position) => ({ position, dx: 0 }));

  const threshold = pinPx * OVERLAP_SHARE * metresPerPixel(first.lat, zoom);
  const group = points.map((_, index) => index);
  const root = (index: number): number => {
    let current = index;
    while (group[current] !== current) current = group[current] ?? current;
    return current;
  };
  points.forEach((a, i) => {
    points.forEach((b, j) => {
      if (j > i && haversine(a, b) < threshold) group[root(j)] = root(i);
    });
  });

  const members = new Map<number, number[]>();
  points.forEach((_, index) => {
    const key = root(index);
    members.set(key, [...(members.get(key) ?? []), index]);
  });

  return points.map((point, index) => {
    const indices = members.get(root(index)) ?? [index];
    if (indices.length === 1) return { position: point, dx: 0 };
    const centre = {
      lat: indices.reduce((sum, i) => sum + (points[i]?.lat ?? 0), 0) / indices.length,
      lng: indices.reduce((sum, i) => sum + (points[i]?.lng ?? 0), 0) / indices.length,
    };
    const slot = indices.indexOf(index) - (indices.length - 1) / 2;
    return { position: centre, dx: slot * (pinPx + SPREAD_GAP_PX) };
  });
}
