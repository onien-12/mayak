import type { GeoPolygon, GeoPosition, GeoRing } from '../api/types';
import type { Bounds, LatLng } from './geo';

const METERS_PER_DEGREE = 111_320;
const CIRCLE_STEPS = 48;

/** Every polygon of a geometry as `[outer ring, ...holes]`. */
export function polygonParts(geometry: GeoPolygon): GeoRing[][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/** Ray casting against one ring (closed or open). */
function ringContains(ring: readonly GeoPosition[], { lat, lng }: LatLng): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether the point lies inside the territory (MultiPolygon parts and holes included). */
export function pointInPolygon(point: LatLng, geometry: GeoPolygon): boolean {
  return polygonParts(geometry).some(
    ([outer, ...holes]) =>
      outer !== undefined &&
      ringContains(outer, point) &&
      !holes.some((hole) => ringContains(hole, point)),
  );
}

export function polygonBounds(geometry: GeoPolygon): Bounds {
  const bounds: Bounds = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity,
  };
  for (const [outer] of polygonParts(geometry)) {
    for (const [lng, lat] of outer ?? []) {
      bounds.minLng = Math.min(bounds.minLng, lng);
      bounds.maxLng = Math.max(bounds.maxLng, lng);
      bounds.minLat = Math.min(bounds.minLat, lat);
      bounds.maxLat = Math.max(bounds.maxLat, lat);
    }
  }
  return bounds;
}

/** Ring in local metres around `origin` (equirectangular — exact enough for a city). */
export function ringToMeters(ring: readonly GeoPosition[], origin: LatLng): [number, number][] {
  const kx = METERS_PER_DEGREE * Math.cos((origin.lat * Math.PI) / 180);
  return ring.map(([lng, lat]) => [
    (lng - origin.lng) * kx,
    (lat - origin.lat) * METERS_PER_DEGREE,
  ]);
}

/** Shoelace area of a ring given in planar coordinates (any unit²). */
export function planarRingArea(points: readonly (readonly [number, number])[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Territory area in m² (holes subtracted). */
export function polygonAreaM2(geometry: GeoPolygon): number {
  const bounds = polygonBounds(geometry);
  const origin = {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };
  return polygonParts(geometry).reduce(
    (total, [outer, ...holes]) =>
      total +
      planarRingArea(ringToMeters(outer ?? [], origin)) -
      holes.reduce((sum, hole) => sum + planarRingArea(ringToMeters(hole, origin)), 0),
    0,
  );
}

/** Closes an open ring (first position repeated at the end). */
export function closeRing(points: readonly GeoPosition[]): GeoRing {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || (first[0] === last[0] && first[1] === last[1])) return [...points];
  return [...points, first];
}

/** The ring without its closing position — the editable vertices. */
export function openRing(ring: readonly GeoPosition[]): GeoPosition[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1];
  return closed ? ring.slice(0, -1) : [...ring];
}

/** A circle approximated by a polygon — what the server stores for a circle input. */
export function circlePolygon(center: LatLng, radiusM: number): GeoPolygon {
  const kx = METERS_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180);
  const points: GeoPosition[] = Array.from({ length: CIRCLE_STEPS }, (_, i) => {
    const angle = (i / CIRCLE_STEPS) * 2 * Math.PI;
    return [
      center.lng + (radiusM * Math.cos(angle)) / kx,
      center.lat + (radiusM * Math.sin(angle)) / METERS_PER_DEGREE,
    ];
  });
  return { type: 'Polygon', coordinates: [closeRing(points)] };
}
