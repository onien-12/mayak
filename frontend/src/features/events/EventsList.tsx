import { Fragment, useMemo, type ReactNode } from 'react';

import type { PlaceCard } from '@/shared/api';
import { haversine, type LatLng } from '@/shared/lib/geo';
import { StaggerItem } from '@/shared/ui';

import { EventCard } from './EventCard';
import { useEventsFilters } from './filtersStore';
import { isOngoing } from './ongoing';
import { dayHeading, dayKey, toDayValue } from './period';

interface DayGroup {
  key: string;
  events: PlaceCard[];
  /** Index of the group's first event in the whole list (for the staggered entrance). */
  offset: number;
}

/**
 * Groups in the order the days first appear (the API already sorts by start). Whatever is going
 * on now belongs to today — even an event that began yesterday — and leads today's group.
 */
function groupByDay(events: readonly PlaceCard[], today: string): DayGroup[] {
  const groups = new Map<string, PlaceCard[]>();
  for (const place of events) {
    if (!place.event) continue;
    const key = isOngoing(place) ? today : dayKey(place.event.starts_at);
    const list = groups.get(key) ?? [];
    list.push(place);
    groups.set(key, list);
  }
  let offset = 0;
  return [...groups].map(([key, list]) => {
    const ordered =
      key === today
        ? [...list.filter(isOngoing), ...list.filter((place) => !isOngoing(place))]
        : list;
    const group = { key, events: ordered, offset };
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
  /** Shown after the first day (grouped) or the first few cards (flat). */
  afterFirstGroup?: ReactNode;
}

/** A flat list has no days: the slot goes after this many cards. */
const FLAT_SLOT_AFTER = 3;

/** The afisha list: day groups with sticky headers («Сегодня», «Завтра, 12 ноября»…). */
export function EventsList({
  events,
  grouped,
  distanceOrigin,
  distanceOnly,
  highlightId,
  afterFirstGroup,
}: EventsListProps) {
  const hideOngoing = useEventsFilters((state) => state.hideOngoing);
  const toggleOngoing = useEventsFilters((state) => state.toggleOngoing);
  const today = toDayValue(new Date());
  const groups = useMemo(
    () => (grouped ? groupByDay(events, today) : null),
    [events, grouped, today],
  );
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

  if (!groups && !afterFirstGroup) {
    return (
      <ul aria-label="События" className="flex flex-col gap-2">
        {events.map((place, index) => card(place, index, true))}
      </ul>
    );
  }
  if (!groups) {
    return (
      <>
        <ul aria-label="События" className="flex flex-col gap-2">
          {events.slice(0, FLAT_SLOT_AFTER).map((place, index) => card(place, index, true))}
        </ul>
        {afterFirstGroup}
        {events.length > FLAT_SLOT_AFTER && (
          <ul aria-label="События, продолжение" className="flex flex-col gap-2">
            {events
              .slice(FLAT_SLOT_AFTER)
              .map((place, index) => card(place, FLAT_SLOT_AFTER + index, true))}
          </ul>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group, groupIndex) => {
        const ongoing = group.key === today ? group.events.filter(isOngoing).length : 0;
        const shown =
          ongoing > 0 && hideOngoing
            ? group.events.filter((place) => !isOngoing(place))
            : group.events;
        return (
          <Fragment key={group.key}>
            <section aria-label={dayHeading(group.key)}>
              <div className="sticky top-0 z-10 -mx-4 flex items-baseline gap-3 bg-surface/90 px-4 py-2.5 backdrop-blur-md lg:-mx-5 lg:px-5 lite:bg-surface">
                <h2 className="text-sm font-semibold text-ink">{dayHeading(group.key)}</h2>
                <span className="text-xs text-ink-faint tabular-nums">{shown.length}</span>
                {ongoing > 0 && (
                  <button
                    type="button"
                    aria-pressed={hideOngoing}
                    onClick={toggleOngoing}
                    className="tap-target relative ml-auto text-xs font-medium text-ink-soft hover:text-ink"
                  >
                    {hideOngoing ? 'Показать идущие' : 'Скрыть идущие'} · {ongoing}
                  </button>
                )}
              </div>
              {shown.length === 0 ? (
                <p className="pb-3 text-sm text-ink-faint">
                  Сегодня есть только то, что идёт сейчас, — оно скрыто.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 pb-2">
                  {shown.map((place, index) => card(place, group.offset + index, false))}
                </ul>
              )}
            </section>
            {groupIndex === 0 && afterFirstGroup && <div className="pb-2">{afterFirstGroup}</div>}
          </Fragment>
        );
      })}
    </div>
  );
}
