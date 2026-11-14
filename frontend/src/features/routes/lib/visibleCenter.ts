import { useMapViewport } from '@/features/map';
import { haversine, type LatLng } from '@/shared/lib/geo';

/** How far apart pins put «в центре карты» stand: a share of the visible width. */
const STEP_SHARE = 0.08;

/**
 * The middle of the map area that is not covered by the panel or the sheet — moved aside while a
 * pin already stands there, so «в центре карты» twice gives two pins one can tell apart.
 */
export function useVisibleCenter(): (taken: readonly LatLng[]) => LatLng | null {
  const viewport = useMapViewport();
  return (taken) => {
    if (!viewport) return null;
    const { minLat, maxLat, minLng, maxLng } = viewport.bounds;
    const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
    const step = (maxLng - minLng) * STEP_SHARE;
    const near = haversine(center, { lat: center.lat, lng: center.lng + step / 2 });
    let spot = center;
    for (let index = 1; taken.some((point) => haversine(point, spot) < near); index += 1) {
      spot = { lat: center.lat, lng: center.lng + index * step };
    }
    return spot;
  };
}
