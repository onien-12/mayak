import { Clock, MapPin } from 'lucide-react';

import { usePlaceParam } from '@/features/map';
import type { ExternalSource, PlaceCard } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { formatDistance } from '@/shared/lib/format';
import { EXTERNAL_SOURCE_META } from '@/shared/lib/labels';
import { PlacePhoto } from '@/shared/ui';

import { LiveDot, PhaseBadge, PriceBadge, SeatsMeter } from './EventBadges';
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

/** Compact source mark on the cover of an imported event («VL.ru»). */
function SourceMark({ external }: { external: ExternalSource }) {
  const meta = EXTERNAL_SOURCE_META[external.source];
  const Icon = meta.icon;
  return (
    <span
      title={meta.description}
      className="absolute bottom-1 left-1 inline-flex h-5 items-center gap-1 rounded-full bg-surface/95 px-1.5 text-2xs font-semibold text-ink shadow-card"
    >
      <Icon size={11} aria-hidden />
      <span className="sr-only">{external.label}</span>
      <span aria-hidden>VL.ru</span>
    </span>
  );
}

/**
 * Afisha card: cover, category, humanised time, where (the address, or the distance within a
 * radius) and the facts that decide «пойти или нет» — price, seats left, a phase worth knowing.
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

  return (
    <article
      data-event-id={place.id}
      className={cn(
        'relative flex gap-3 rounded-card border bg-surface p-2.5 transition-[border-color,box-shadow,scale] duration-150 has-[h3>button:active]:scale-[0.98]',
        highlighted
          ? 'border-event shadow-card ring-3 ring-event/15'
          : 'border-line/70 hover:border-ink-faint/50 hover:shadow-card',
      )}
    >
      <div className="relative shrink-0 self-start">
        <PlacePhoto
          src={place.cover_url}
          credit={place.cover_credit}
          layer="event"
          slug={category?.slug}
          alt={place.title}
          className={cn('size-[84px] rounded-control', muted && 'opacity-60 grayscale')}
        />
        {place.external && <SourceMark external={place.external} />}
        {event.phase === 'ongoing' && (
          <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-surface/95 shadow-card">
            <LiveDot />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-event-ink">
          <Clock size={13} aria-hidden className="shrink-0" />
          <span className="truncate">{eventTimeLabel(event, withDate)}</span>
          {category && <span className="shrink-0 text-ink-faint">· {category.name}</span>}
        </p>
        <h3
          className={cn(
            'text-base leading-tight font-semibold',
            muted ? 'text-ink-soft' : 'text-ink',
            event.phase === 'cancelled' && 'line-through decoration-ink-faint',
          )}
        >
          <button
            type="button"
            onClick={() => openPlace(place.id)}
            className="block text-left after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
          >
            {/* Clamped here: a button is one inline box, so a clamp on the heading never cuts it. */}
            <span className="line-clamp-2">{place.title}</span>
          </button>
        </h3>
        {venue && (
          <p className="flex items-center gap-1 truncate text-sm text-ink-soft">
            <MapPin size={13} aria-hidden className="shrink-0 text-ink-faint" />
            <span className="truncate">{venue}</span>
          </p>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <PhaseBadge event={event} />
          <PriceBadge event={event} />
          {event.is_meetup && <SeatsMeter event={event} />}
        </div>
      </div>
    </article>
  );
}
