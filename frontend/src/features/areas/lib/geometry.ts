import type { GeoPolygon, GeoPosition } from '@/shared/api';
import { formatNumber } from '@/shared/lib/format';
import type { LatLng } from '@/shared/lib/geo';
import {
  closeRing,
  openRing,
  planarRingArea,
  polygonAreaM2,
  polygonParts,
  ringToMeters,
} from '@/shared/lib/polygon';

type Point = readonly [number, number];

/** Sign of the turn a → b → c: > 0 left, < 0 right, 0 collinear. Unit-free. */
function orientation(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] &&
    p[1] <= Math.max(a[1], b[1])
  );
}

/** Whether segments p1–p2 and q1–q2 touch or cross (any planar unit). */
export function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = orientation(q1, q2, p1);
  const d2 = orientation(q1, q2, p2);
  const d3 = orientation(p1, p2, q1);
  const d4 = orientation(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true;
  return (
    (d1 === 0 && onSegment(q1, q2, p1)) ||
    (d2 === 0 && onSegment(q1, q2, p2)) ||
    (d3 === 0 && onSegment(p1, p2, q1)) ||
    (d4 === 0 && onSegment(p1, p2, q2))
  );
}

/** Whether the closed outline through `points` (open ring) crosses itself. */
export function ringSelfIntersects(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i]!;
    const a2 = points[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsIntersect(a1, a2, points[j]!, points[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

export const MIN_VERTICES = 3;
const MAX_VERTICES = 499;
const MIN_AREA_M2 = 100;
const MAX_AREA_M2 = 30_000_000;

/** Friendly problem with a hand-drawn outline, or `null` when it can be saved. */
export function outlineProblem(vertices: readonly GeoPosition[]): string | null {
  if (vertices.length < MIN_VERTICES) {
    const left = MIN_VERTICES - vertices.length;
    return `Нужно ещё ${left} ${left === 1 ? 'точка' : 'точки'}`;
  }
  if (vertices.length > MAX_VERTICES) return 'Слишком много точек — уберите лишние';
  const origin = { lng: vertices[0]![0], lat: vertices[0]![1] };
  const local = ringToMeters(vertices, origin);
  if (ringSelfIntersects(local)) return 'Границы пересекают сами себя — передвиньте точки';
  const area = planarRingArea(local);
  if (area < MIN_AREA_M2) return 'Территория слишком маленькая — разведите точки шире';
  if (area > MAX_AREA_M2) return 'Больше 30 км² — это уже район, а не локация';
  return null;
}

export function outlineGeometry(vertices: readonly GeoPosition[]): GeoPolygon {
  return { type: 'Polygon', coordinates: [closeRing(vertices)] };
}

/** Editable vertices of a geometry: the outer ring of its largest part. */
export function editableVertices(geometry: GeoPolygon): GeoPosition[] {
  const parts = polygonParts(geometry);
  const largest = parts
    .map((rings) => ({ rings, size: polygonAreaM2({ type: 'Polygon', coordinates: rings }) }))
    .sort((a, b) => b.size - a.size)[0];
  return openRing(largest?.rings[0] ?? []);
}

/** Every n-th vertex, so a dense outline (a circle) stays comfortable to edit by hand. */
export function thinVertices(vertices: readonly GeoPosition[], max: number): GeoPosition[] {
  if (vertices.length <= max) return [...vertices];
  const step = Math.ceil(vertices.length / max);
  return vertices.filter((_, index) => index % step === 0);
}

export const midpoint = (a: GeoPosition, b: GeoPosition): GeoPosition => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

export const toPosition = ({ lat, lng }: LatLng): GeoPosition => [lng, lat];

/** «850 м²», «2,3 га», «1,2 км²». */
export function formatSquare(m2: number): string {
  if (m2 < 10_000) return `${formatNumber(Math.round(m2 / 10) * 10)} м²`;
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(1).replace('.', ',')} га`;
  return `${(m2 / 1_000_000).toFixed(1).replace('.', ',')} км²`;
}

/** «Нагорный парк, Ленинский район, Владивосток…» → «Нагорный парк» (OSM display names). */
export function shortPlaceName(title: string): string {
  return title.split(',')[0]?.trim() || title;
}
