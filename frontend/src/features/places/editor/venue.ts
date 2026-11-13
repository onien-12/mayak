import { haversine, type LatLng } from '@/shared/lib/geo';

/** An existing place an event is held at. */
export interface Venue extends LatLng {
  id: number;
  title: string;
}

/** The pin may wander this far from a venue and still be «at» it. */
const AT_VENUE_M = 150;

export function isAtVenue(point: LatLng, venue: Venue): boolean {
  return haversine(point, venue) <= AT_VENUE_M;
}
