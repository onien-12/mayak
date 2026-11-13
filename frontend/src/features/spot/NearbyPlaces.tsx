import { useQuery } from '@tanstack/react-query';

import type { MapTap } from '@/features/map';
import { PlaceListItem } from '@/features/places';
import { placesApi, queryKeys, type PlacesQuery } from '@/shared/api';
import { haversine } from '@/shared/lib/geo';
import { ListSkeleton, StaggerItem } from '@/shared/ui';

/** «What the map already knows here»: places of all layers within this radius (SPEC §13). */
const NEARBY_RADIUS_M = 80;

/** Places within 80 m of the spot, nearest first; tap → place card on top of the sheet. */
export function NearbyPlaces({ spot }: { spot: MapTap }) {
  const query: PlacesQuery = {
    near: `${spot.lat.toFixed(6)},${spot.lng.toFixed(6)}`,
    radius_m: NEARBY_RADIUS_M,
  };
  const places = useQuery({
    queryKey: queryKeys.places.list(query),
    queryFn: ({ signal }) => placesApi.list(query, signal),
  });

  if (places.isError || places.data?.length === 0) return null;

  return (
    <section aria-labelledby="spot-nearby" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="spot-nearby" className="font-display text-base font-semibold text-ink">
          Что здесь уже отмечено
        </h2>
        <span className="text-sm text-ink-soft">в радиусе {NEARBY_RADIUS_M} м</span>
      </div>
      {places.isPending && <ListSkeleton rows={2} />}
      {places.data && (
        <ul className="flex flex-col gap-2">
          {places.data.map((place, index) => (
            <StaggerItem key={place.id} index={index}>
              <PlaceListItem place={place} distanceM={haversine(spot, place)} />
            </StaggerItem>
          ))}
        </ul>
      )}
    </section>
  );
}
