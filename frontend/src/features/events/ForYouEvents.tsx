import { useMemo } from 'react';

import { ForYouCard, ForYouStrip, useRecommendations } from '@/features/interests';
import { useMapRecommended, usePlaceParam } from '@/features/map';
import type { PlaceCard, Recommendation } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { PlacePhoto } from '@/shared/ui';

import { eventTimeLabel } from './eventTime';
import { useEventsFilters } from './filtersStore';
import { periodBounds } from './period';

const NO_PLACES: readonly PlaceCard[] = [];
const itemKey = (item: Recommendation) => `place:${item.place?.id ?? 'none'}`;

interface ForYouEventsProps {
  /** The loaded feed: recommended events among them get the accent on the map. */
  events: readonly PlaceCard[] | undefined;
  /** Past events or a text search: the strip steps aside. */
  hidden: boolean;
}

/**
 * «Для вас» of the afisha (SPEC §23.5): upcoming events matching the profile within the chosen
 * period, above «Идёт сейчас» and the day list, which stay complete.
 */
export function ForYouEvents({ events, hidden }: ForYouEventsProps) {
  const time = useEventsFilters((state) => state.time);
  const range = useEventsFilters((state) => state.range);
  const { openPlace } = usePlaceParam();
  const { byId } = useCategories();
  const query = useRecommendations(
    { scope: 'events', ...periodBounds({ time, range }) },
    { enabled: !hidden },
  );
  const data = hidden ? undefined : query.data;

  const items = data?.items;
  const marked = useMemo(() => {
    if (!items || !events) return NO_PLACES;
    const ids = new Set(events.map((place) => place.id));
    return items.flatMap((item) => (item.place && ids.has(item.place.id) ? [item.place] : []));
  }, [items, events]);
  useMapRecommended(marked);

  return (
    <ForYouStrip
      recommendations={data}
      itemKey={itemKey}
      renderCard={(item) => {
        const place = item.place;
        if (!place?.event) return null;
        return (
          <ForYouCard
            cover={
              <PlacePhoto
                src={place.cover_url}
                credit={place.cover_credit}
                layer="event"
                slug={byId.get(place.category_id)?.slug}
                alt={place.title}
                className="size-full"
              />
            }
            eyebrow={<span className="text-event-ink">{eventTimeLabel(place.event, true)}</span>}
            title={place.title}
            reasons={item.topics}
            onOpen={() => openPlace(place.id)}
          />
        );
      }}
    />
  );
}
