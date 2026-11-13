export interface LatLng {
  lat: number;
  lng: number;
}

/** `[lng, lat]` — the coordinate order used by 2GIS MapGL and line geometry in the API. */
export type LngLat = [lng: number, lat: number];

export interface Bounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export const VLADIVOSTOK_CENTER: LatLng = { lat: 43.1155, lng: 131.8869 };
export const DEFAULT_ZOOM = 13;

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function toLngLat(point: LatLng): LngLat {
  return [point.lng, point.lat];
}

export function fromLngLat(coords: readonly number[]): LatLng {
  return { lng: coords[0] ?? 0, lat: coords[1] ?? 0 };
}

export function boundsContain(bounds: Bounds, point: LatLng): boolean {
  return (
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng &&
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat
  );
}

export function boundsOfPoints(points: readonly LatLng[]): Bounds | null {
  const first = points[0];
  if (!first) return null;
  const bounds: Bounds = {
    minLng: first.lng,
    maxLng: first.lng,
    minLat: first.lat,
    maxLat: first.lat,
  };
  for (const p of points) {
    bounds.minLng = Math.min(bounds.minLng, p.lng);
    bounds.maxLng = Math.max(bounds.maxLng, p.lng);
    bounds.minLat = Math.min(bounds.minLat, p.lat);
    bounds.maxLat = Math.max(bounds.maxLat, p.lat);
  }
  return bounds;
}

/**
 * Snaps bounds outward to a coarse grid so that small pans and zooms reuse the same
 * `bbox` request (and cached response) instead of refetching on every move.
 */
export function snapBoundsOutward(bounds: Bounds): Bounds {
  const span = Math.max(bounds.maxLng - bounds.minLng, bounds.maxLat - bounds.minLat, 1e-4);
  const step = 2 ** Math.ceil(Math.log2(span)) / 4;
  const round = (value: number) => Number(value.toFixed(6));
  return {
    minLng: round(Math.floor(bounds.minLng / step) * step),
    minLat: round(Math.floor(bounds.minLat / step) * step),
    maxLng: round(Math.ceil(bounds.maxLng / step) * step),
    maxLat: round(Math.ceil(bounds.maxLat / step) * step),
  };
}

/** `minLng,minLat,maxLng,maxLat` — the `bbox` query parameter format. */
export function boundsToBbox(bounds: Bounds): string {
  return [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat].join(',');
}

export function formatCoords(point: LatLng): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}
