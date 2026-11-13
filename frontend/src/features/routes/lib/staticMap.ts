import { TWOGIS_KEY } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

import { mercator, unmercator } from './geometry';

/**
 * 2GIS Static API (https://docs.2gis.com/maps/others/static/reference): `s=WxH@2x`,
 * `c=lat,lon`, integer `z` 1..18, 256 px Web Mercator tiles. We request a bare base map for
 * an explicit centre and zoom and draw the route ourselves on top, so the projection is
 * known exactly and the line and numbers look the same as in the app and on paper.
 */
const STATIC_URL = 'https://static.maps.2gis.com/2.0';
const TILE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 17;

export interface StaticView {
  /** Mercator centre, normalised. */
  cx: number;
  cy: number;
  zoom: number;
  width: number;
  height: number;
}

/** Largest integer zoom at which all points fit into the box with `padding` px around. */
export function fitStaticView(
  points: readonly LatLng[],
  width: number,
  height: number,
  padding: number,
): StaticView {
  const projected = points.map(mercator);
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const fit = Math.min(
    Math.log2((width - padding * 2) / (spanX * TILE)),
    Math.log2((height - padding * 2) / (spanY * TILE)),
  );
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(fit))),
    width,
    height,
  };
}

/** Pixel position of a point on the image of `view`. */
export function projectStatic(point: LatLng, view: StaticView): { x: number; y: number } {
  const scale = TILE * 2 ** view.zoom;
  const { x, y } = mercator(point);
  return {
    x: view.width / 2 + (x - view.cx) * scale,
    y: view.height / 2 + (y - view.cy) * scale,
  };
}

/** Metres per pixel in the middle of the view. */
export function metersPerPixel(view: StaticView): number {
  const { lat } = unmercator(view.cx, view.cy);
  return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (TILE * 2 ** view.zoom);
}

/** URL of the base map image, `null` without a 2GIS key. Retina (`@2x`) for crisp print. */
export function staticMapUrl(view: StaticView): string | null {
  if (!TWOGIS_KEY) return null;
  const center = unmercator(view.cx, view.cy);
  const params = new URLSearchParams({
    s: `${view.width}x${view.height}@2x`,
    c: `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`,
    z: String(view.zoom),
    key: TWOGIS_KEY,
  });
  return `${STATIC_URL}?${params.toString()}`;
}
