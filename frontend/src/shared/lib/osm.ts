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

/**
 * Such an object with nothing to show for itself: no name of its own (thousands of yard
 * playgrounds and sports grounds titled by their category), or a sight that is a bare title —
 * a lone monument, plaque or fountain with no photo. Kept in the data and countable, but drawn
 * only when asked for (its category, a search or «Всё из OpenStreetMap»), so the map stays
 * about what residents added and what is worth a look (SPEC §18). A photo or one confirmation
 * by a resident brings such an object back.
 */
export function isBareBackground(
  place: Pick<PlaceCard, 'external' | 'last_confirmed_at' | 'title' | 'layer' | 'cover_url'>,
  categoryName: string | undefined,
): boolean {
  if (!isUnconfirmedOsm(place)) return false;
  return place.title === categoryName || (place.layer === 'tourism' && !place.cover_url);
}
