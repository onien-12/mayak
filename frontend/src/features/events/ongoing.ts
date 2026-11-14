import type { PlaceCard } from '@/shared/api';

/** Going on right now: shown first in today's group, with the «Идёт сейчас» mark of its card. */
export const isOngoing = (place: PlaceCard): boolean => place.event?.phase === 'ongoing';

/**
 * What the day list (and the map, which follows it) shows: events going on now step aside when
 * the person folded them — only in the day-grouped list, where the toggle lives.
 */
export function withoutHiddenOngoing(
  events: readonly PlaceCard[],
  { hideOngoing, grouped }: { hideOngoing: boolean; grouped: boolean },
): readonly PlaceCard[] {
  return hideOngoing && grouped ? events.filter((place) => !isOngoing(place)) : events;
}
