import type { PlaceCard } from '../api/types';

/** OpenStreetMap copyright page — the link behind every «© участники OpenStreetMap». */
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/**
 * An object of the OpenStreetMap base layer that no resident has confirmed yet: a background
 * layer — drawn lighter on the map and left out by the trust filters (SPEC §18).
 */
export function isUnconfirmedOsm(
  place: Pick<PlaceCard, 'external' | 'last_confirmed_at'>,
): boolean {
  return place.external?.source === 'osm' && place.last_confirmed_at === null;
}
