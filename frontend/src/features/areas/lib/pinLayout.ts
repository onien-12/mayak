import type { AreaCard } from '@/shared/api';
import { boundsContain, type Bounds, type LngLat } from '@/shared/lib/geo';

import { shownInterest } from './interest';

const TILE_PX = 256;
/** Below this zoom the pills are compact (smaller tile, smaller type). */
export const COMPACT_PIN_ZOOM = 14;
/** Free space kept between labels and markers, px. */
const GAP_PX = 8;

interface PillSize {
  height: number;
  /** Tile + paddings + count bubble around the title. */
  chrome: number;
  charWidth: number;
  maxTitle: number;
  dot: number;
  /** Where the centre of the kind tile sits from the pill's left edge. */
  tileCentre: number;
}

const PILL: Record<'regular' | 'compact', PillSize> = {
  regular: { height: 40, chrome: 86, charWidth: 7.6, maxTitle: 176, dot: 36, tileCentre: 20 },
  compact: { height: 32, chrome: 66, charWidth: 6.6, maxTitle: 144, dot: 30, tileCentre: 15 },
};

/** Place-marker clustering as configured in the marker layer (`features/map`). */
const CLUSTER_RADIUS_PX = 64;
const PIN_BOX = { width: 30, height: 40, lift: 22 };

/** A dot may be nudged off its spot by this share of its size to find free room. */
const DOT_NUDGE = 0.8;
const DOT_DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0.7, -0.7],
  [-0.7, -0.7],
  [0.7, 0.7],
  [-0.7, 0.7],
];

/** How many areas in view keep the labelled pill at a zoom; the rest become dots. */
function fullPillBudget(zoom: number): number {
  if (zoom < 12.5) return 3;
  if (zoom < 13.5) return 5;
  return Infinity;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `full` — labelled pill; `dot` — the kind tile only; shifted by `dx` / `dy` px from the spot. */
export interface AreaPinPlacement {
  variant: 'full' | 'dot';
  dx: number;
  dy: number;
  compact: boolean;
}

/** Web Mercator pixel position at the given zoom (only relative positions matter). */
function project(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const scale = TILE_PX * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Partly in view — the edge of the visible map would cut it. */
const clipped = (box: Box, view: Box) => {
  const dx = Math.abs(box.x - view.x) * 2;
  const dy = Math.abs(box.y - view.y) * 2;
  const inside = dx <= view.width - box.width && dy <= view.height - box.height;
  const outside = dx >= view.width + box.width || dy >= view.height + box.height;
  return !inside && !outside;
};

const overlaps = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) * 2 < a.width + b.width + GAP_PX &&
  Math.abs(a.y - b.y) * 2 < a.height + b.height + GAP_PX;

/** The visible part of the map as a pixel box. */
function viewBox(bounds: Bounds, zoom: number): Box {
  const topLeft = project(bounds.minLng, bounds.maxLat, zoom);
  const bottomRight = project(bounds.maxLng, bounds.minLat, zoom);
  return {
    x: (topLeft.x + bottomRight.x) / 2,
    y: (topLeft.y + bottomRight.y) / 2,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

function clusterDiameter(count: number): number {
  if (count < 10) return 40;
  if (count < 50) return 46;
  return 52;
}

/**
 * Approximates what the place layer draws at this zoom: points within the cluster radius of
 * a seed merge into a bubble at their centroid, a lone point is a pin standing on its tip.
 */
function markerBoxes(points: readonly LngLat[], zoom: number): Box[] {
  const groups: { seedX: number; seedY: number; sumX: number; sumY: number; count: number }[] = [];
  for (const [lng, lat] of points) {
    const { x, y } = project(lng, lat, zoom);
    const group = groups.find(
      (item) => Math.hypot(item.seedX - x, item.seedY - y) <= CLUSTER_RADIUS_PX,
    );
    if (group) {
      group.sumX += x;
      group.sumY += y;
      group.count += 1;
    } else {
      groups.push({ seedX: x, seedY: y, sumX: x, sumY: y, count: 1 });
    }
  }
  return groups.map(({ sumX, sumY, count }) => {
    const x = sumX / count;
    const y = sumY / count;
    if (count === 1) return { x, y: y - PIN_BOX.lift, ...PIN_BOX };
    const size = clusterDiameter(count);
    return { x, y, width: size, height: size };
  });
}

/**
 * Where each area marker goes while places are folded. The most interesting areas in view
 * keep the labelled pill — centred on the spot or shifted so its tile sits on it — within a
 * zoom-dependent budget, so the city view stays calm. A pill with no free room (other pills,
 * place pins, clusters, the edge of the visible map) becomes a dot, nudged a little off its
 * spot if needed; a dot with no room at all is left out until the user zooms in. `priority`
 * areas (recommended to the viewer) go first and are never left out — as a last resort a dot
 * on their spot. Order otherwise follows the interest the viewer sees. Pure and
 * translation-invariant: depends on the zoom and the markers, not on the map centre.
 */
export function layoutAreaPins(
  areas: readonly AreaCard[],
  {
    zoom,
    markers,
    bounds,
    priority,
  }: {
    zoom: number;
    markers: readonly LngLat[];
    bounds: Bounds | null;
    priority?: ReadonlySet<number>;
  },
): Map<number, AreaPinPlacement> {
  const compact = zoom < COMPACT_PIN_ZOOM;
  const size = PILL[compact ? 'compact' : 'regular'];
  const taken = markerBoxes(markers, zoom);
  const result = new Map<number, AreaPinPlacement>();
  let budget = fullPillBudget(zoom);
  const view = bounds && viewBox(bounds, zoom);

  /** First offset where the box is free and not cut by the edge of the view. */
  const place = (box: Box, offsets: readonly (readonly [number, number])[]) => {
    for (const [dx, dy] of offsets) {
      const moved = { ...box, x: box.x + dx, y: box.y + dy };
      if (view && clipped(moved, view)) continue;
      if (taken.every((other) => !overlaps(moved, other))) {
        taken.push(moved);
        return { dx, dy };
      }
    }
    return null;
  };

  const first = (area: AreaCard) => (priority?.has(area.id) ? 1 : 0);
  const byInterest = [...areas].sort(
    (a, b) => first(b) - first(a) || shownInterest(b).value - shownInterest(a).value,
  );
  for (const area of byInterest) {
    const { x, y } = project(area.lng, area.lat, zoom);
    const inView = bounds === null || boundsContain(bounds, area);

    if (budget > 0) {
      const width = size.chrome + Math.min(size.maxTitle, area.title.length * size.charWidth);
      const shift = width / 2 - size.tileCentre;
      const spot = place({ x, y, width, height: size.height }, [
        [0, 0],
        [shift, 0],
        [-shift, 0],
      ]);
      if (spot) {
        result.set(area.id, { variant: 'full', ...spot, compact });
        if (inView) budget -= 1;
        continue;
      }
    }

    const nudge = size.dot * DOT_NUDGE;
    const spot = place(
      { x, y, width: size.dot, height: size.dot },
      DOT_DIRECTIONS.map(([dx, dy]) => [Math.round(dx * nudge), Math.round(dy * nudge)] as const),
    );
    if (spot) result.set(area.id, { variant: 'dot', ...spot, compact });
    else if (priority?.has(area.id)) result.set(area.id, { variant: 'dot', dx: 0, dy: 0, compact });
  }
  return result;
}
