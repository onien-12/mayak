import { useMemo } from 'react';

import type { PlaceCard } from '@/shared/api';
import { haversine, type LatLng } from '@/shared/lib/geo';
import { StaggerItem } from '@/shared/ui';

import { EventCard } from './EventCard';
import { dayHeading, dayKey } from './period';

interface DayGroup {
  key: string;
  events: PlaceCard[];
  /** Index of the group's first event in the whole list (for the staggered entrance). */
  offset: number;
}

/** Groups in the order the days first appear (the API already sorts by start). */
function groupByDay(events: readonly PlaceCard[]): DayGroup[] {
  const groups = new Map<string, PlaceCard[]>();
  for (const place of events) {
    if (!place.event) continue;
    const key = dayKey(place.event.starts_at);
    const list = groups.get(key) ?? [];
    list.push(place);
    groups.set(key, list);
  }
  let offset = 0;
  return [...groups].map(([key, list]) => {
    const group = { key, events: list, offset };
    offset += list.length;
    return group;
  });
}

interface EventsListProps {
  events: readonly PlaceCard[];
  /** Sorted by start → grouped by day with sticky headers; otherwise a flat list. */
  grouped: boolean;
  distanceOrigin: LatLng | null;
  /** A radius is set: cards show the distance instead of the address. */
  distanceOnly: boolean;
  highlightId: number | null;
}

/** The afisha list: day groups with sticky headers («Сегодня», «Завтра, 12 ноября»…). */
export function EventsList({
  events,
  grouped,
  distanceOrigin,
  distanceOnly,
  highlightId,
}: EventsListProps) {
  const groups = useMemo(() => (grouped ? groupByDay(events) : null), [events, grouped]);
  const card = (place: PlaceCard, index: number, withDate: boolean) => (
    <StaggerItem key={place.id} index={index}>
      <EventCard
        place={place}
        withDate={withDate}
        highlighted={place.id === highlightId}
        distanceM={distanceOrigin ? haversine(distanceOrigin, place) : undefined}
        distanceOnly={distanceOnly}
      />
    </StaggerItem>
  );

  if (!groups) {
    return (
      <ul aria-label="События" className="flex flex-col gap-2">
        {events.map((place, index) => card(place, index, true))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => (
        <section key={group.key} aria-label={dayHeading(group.key)}>
          <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between bg-surface/90 px-4 py-2.5 backdrop-blur-md lg:-mx-5 lg:px-5 lite:bg-surface">
            <span className="text-sm font-semibold text-ink">{dayHeading(group.key)}</span>
            <span className="text-xs text-ink-faint tabular-nums">{group.events.length}</span>
          </h2>
          <ul className="flex flex-col gap-2 pb-2">
            {group.events.map((place, index) => card(place, group.offset + index, false))}
          </ul>
        </section>
      ))}
    </div>
  );
}
