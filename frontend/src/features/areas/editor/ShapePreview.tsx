import type { GeoPolygon } from '@/shared/api';
import { polygonBounds, polygonParts } from '@/shared/lib/polygon';

const VIEW = 48;
const INSET = 4;

/** Tiny silhouette of a territory (equirectangular, aspect kept) for candidate cards. */
export function ShapePreview({ geometry, color }: { geometry: GeoPolygon; color: string }) {
  const bounds = polygonBounds(geometry);
  const kx = Math.cos((((bounds.minLat + bounds.maxLat) / 2) * Math.PI) / 180);
  const width = (bounds.maxLng - bounds.minLng) * kx || 1e-9;
  const height = bounds.maxLat - bounds.minLat || 1e-9;
  const scale = (VIEW - INSET * 2) / Math.max(width, height);
  const dx = (VIEW - width * scale) / 2;
  const dy = (VIEW - height * scale) / 2;
  const path = polygonParts(geometry)
    .flatMap((rings) => rings)
    .map(
      (ring) =>
        'M' +
        ring
          .map(
            ([lng, lat]) =>
              `${(dx + (lng - bounds.minLng) * kx * scale).toFixed(1)} ${(dy + (bounds.maxLat - lat) * scale).toFixed(1)}`,
          )
          .join('L') +
        'Z',
    )
    .join('');

  return (
    <svg aria-hidden viewBox={`0 0 ${VIEW} ${VIEW}`} className="size-12 shrink-0">
      <path
        d={path}
        fill={color}
        fillOpacity={0.22}
        fillRule="evenodd"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
