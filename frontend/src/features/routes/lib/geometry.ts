import type { PathPoint } from '@/shared/api';
import { haversine, type LatLng } from '@/shared/lib/geo';

/** `[lng, lat][]` → `{ lat, lng }[]`. */
export function pathToPoints(path: readonly PathPoint[]): LatLng[] {
  return path.map(([lng, lat]) => ({ lat, lng }));
}

/** Web Mercator, normalised to `[0, 1]` (x grows east, y grows south). */
export function mercator({ lat, lng }: LatLng): { x: number; y: number } {
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

/** Inverse of `mercator`. */
export function unmercator(x: number, y: number): LatLng {
  const n = Math.PI - 2 * Math.PI * y;
  return { lng: x * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(n)) };
}

function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const scale = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lng * scale;
  const bx = b.lng * scale;
  const px = p.lng * scale;
  const dx = bx - ax;
  const dy = b.lat - a.lat;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (p.lat - a.lat) * dy) / length));
  return Math.hypot(px - (ax + t * dx), p.lat - (a.lat + t * dy));
}

/** Index of the segment `[i, i + 1]` of a polyline that passes closest to `point`. */
export function nearestSegment(points: readonly LatLng[], point: LatLng): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const distance = distanceToSegment(point, a, b);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Douglas–Peucker simplification with a tolerance in metres (approximate, fine for
 * drawing a city-scale line). The first and last points are always kept.
 */
function simplifyPath(points: readonly LatLng[], toleranceM: number): LatLng[] {
  if (points.length <= 2) return [...points];
  const tolerance = toleranceM / 111_320;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop() ?? [0, 0];
    const a = points[start];
    const b = points[end];
    if (!a || !b) continue;
    let index = -1;
    let max = tolerance;
    for (let i = start + 1; i < end; i += 1) {
      const p = points[i];
      if (!p) continue;
      const distance = distanceToSegment(p, a, b);
      if (distance > max) {
        max = distance;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Simplifies until the line has at most `maxPoints` points (for URLs and sketches). */
export function simplifyToCount(points: readonly LatLng[], maxPoints: number): LatLng[] {
  let tolerance = 2;
  let result = simplifyPath(points, tolerance);
  while (result.length > maxPoints) {
    tolerance *= 2;
    result = simplifyPath(points, tolerance);
  }
  return result;
}

/** Initial compass bearing from `a` to `b`, degrees clockwise from north. */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = [
  'север',
  'северо-восток',
  'восток',
  'юго-восток',
  'юг',
  'юго-запад',
  'запад',
  'северо-запад',
];

/** «на северо-восток» for a bearing in degrees. */
export function compassDirection(degrees: number): string {
  return COMPASS[Math.round(degrees / 45) % 8] ?? 'север';
}

/** Lengths of the straight segments between consecutive points, metres. */
export function straightLegs(points: readonly LatLng[]): number[] {
  return points.slice(1).map((point, i) => haversine(points[i] ?? point, point));
}

export interface XY {
  x: number;
  y: number;
}

/**
 * Projects a line into a `width × height` box with `padding` (Mercator, aspect preserved,
 * centred) — for card sketches and schematic maps.
 */
export function fitToBox(
  points: readonly LatLng[],
  width: number,
  height: number,
  padding: number,
): XY[] {
  const projected = points.map(mercator);
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(Math.max(...xs) - minX, 1e-9);
  const spanY = Math.max(Math.max(...ys) - minY, 1e-9);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return projected.map((p) => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (p.y - minY) * scale,
  }));
}

/** SVG `d` of a polyline. */
export function toPathData(points: readonly XY[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
}
