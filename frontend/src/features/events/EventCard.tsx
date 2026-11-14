import { usePlaceParam } from '@/features/map';
import type { EventBrief, PlaceCard } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { formatDistance, formatNumber } from '@/shared/lib/format';
import { ListCard, ListMark, PlacePhoto } from '@/shared/ui';

import { PhaseBadge } from './EventBadges';
import { eventTimeLabel } from './eventTime';

interface EventCardProps {
  place: PlaceCard;
  /** Flat lists (sorted by price, popularity…) show the date; day groups show time only. */
  withDate?: boolean;
  distanceM?: number;
  /** A radius is set: the list is «рядом» already, so the distance replaces the address. */
  distanceOnly?: boolean;
  /** Selected on the map — outlined in the event colour. */
  highlighted?: boolean;
}

/**
 * Price in words: «Бесплатно», «600 ₽» or the source's note. Unknown price (`null`, imported
 * events) gives the note or nothing — never «бесплатно».
 */
function priceLabel(event: EventBrief): string | null {
  if (event.price === null) return event.price_note;
  if (event.price === 0) return 'Бесплатно';
  return event.price_note ?? `${formatNumber(event.price)} ₽`;
}

/**
 * Afisha card: cover, name, «when · where» (the address, or the distance within a radius) and
 * what decides «пойти или нет» — a phase worth knowing (going on, no seats, cancelled) and the
 * price. Category, source, seats and organiser are on the event's card.
 */
export function EventCard({
  place,
  withDate = false,
  distanceM,
  distanceOnly = false,
  highlighted = false,
}: EventCardProps) {
  const { byId } = useCategories();
  const { openPlace } = usePlaceParam();
  const event = place.event;
  if (!event) return null;

  const category = byId.get(place.category_id);
  const muted = event.phase === 'cancelled' || event.phase === 'finished';
  const distance = distanceM !== undefined ? formatDistance(distanceM) : null;
  const venue = (distanceOnly && distance ? [distance] : [distance, place.address])
    .filter(Boolean)
    .join(' · ');
  const price = priceLabel(event);

  return (
    <ListCard
      data-event-id={place.id}
      media={
        <PlacePhoto
          src={place.cover_url}
          credit={place.cover_credit}
          layer="event"
          slug={category?.slug}
          alt={place.title}
          className="size-full"
        />
      }
      title={place.title}
      onSelect={() => openPlace(place.id)}
      meta={
        <>
          <span className="font-medium text-ink">{eventTimeLabel(event, withDate)}</span>
          {venue && ` · ${venue}`}
        </>
      }
      marks={
        <>
          <PhaseBadge event={event} />
          {price && <ListMark strong>{price}</ListMark>}
        </>
      }
      highlight={highlighted && 'event'}
      muted={muted}
      titleClassName={event.phase === 'cancelled' ? 'line-through decoration-ink-faint' : undefined}
    />
  );
}
