import { CalendarClock, LandPlot, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';

import { ForYouMark } from '@/features/interests';
import { usePlaceParam } from '@/features/map';
import type { PlaceCard } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import {
  capitalize,
  formatDateTime,
  formatDistance,
  formatPrice,
  pluralize,
  PLURALS,
} from '@/shared/lib/format';
import {
  ISSUE_STAGE_META,
  LAYER_META,
  OUTAGE_RESOURCE_META,
  PHASE_META,
} from '@/shared/lib/labels';
import { isUnconfirmedImport } from '@/shared/lib/imports';
import { TONES } from '@/shared/lib/tones';
import { Badge, ExternalBadge, ListRating, PlacePhoto, TrustBadge } from '@/shared/ui';

interface PlaceListItemProps {
  place: PlaceCard;
  /** Shown next to the address («350 м»). */
  distanceM?: number;
  /** Defaults to opening the place card (`?place=<id>`). */
  onSelect?: (place: PlaceCard) => void;
  selected?: boolean;
  /** Extra controls on the right (remove from collection, reorder…). */
  trailing?: ReactNode;
  /** Leave out the area name — the list is already inside that area's card. */
  hideArea?: boolean;
  /** Recommended to the viewer: a quiet «для вас» mark next to the category. */
  forYou?: boolean;
  className?: string;
}

function EventMeta({ place }: { place: PlaceCard }) {
  const event = place.event;
  if (!event) return null;
  const phase = PHASE_META[event.phase];
  const highlight = event.phase !== 'open';
  return (
    <>
      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-event-ink">
        <CalendarClock size={14} aria-hidden className="shrink-0" />
        <span className="truncate">{capitalize(formatDateTime(event.starts_at))}</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {highlight && (
          <Badge tone={phase.tone} icon={phase.icon}>
            {phase.label}
          </Badge>
        )}
        {(event.price !== null || event.price_note) && (
          <Badge tone={event.price === 0 ? 'success' : 'neutral'}>
            {formatPrice(event.price, event.price_note)}
          </Badge>
        )}
        {event.is_meetup && <Badge tone="event">Встреча</Badge>}
        {place.external && <ExternalBadge external={place.external} />}
      </div>
    </>
  );
}

function IssueMeta({ place }: { place: PlaceCard }) {
  const issue = place.issue;
  if (!issue) return null;
  const stage = ISSUE_STAGE_META[issue.stage];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={stage.tone} icon={stage.icon}>
        {stage.label}
      </Badge>
      {issue.outage && (
        <Badge
          tone={OUTAGE_RESOURCE_META[issue.outage.resource].tone}
          icon={OUTAGE_RESOURCE_META[issue.outage.resource].icon}
        >
          {pluralize(issue.outage.buildings_count, PLURALS.house)}
        </Badge>
      )}
      {issue.source === 'official' && !place.external && <Badge tone="official">Официально</Badge>}
      {place.external && <ExternalBadge external={place.external} />}
    </div>
  );
}

/**
 * Compact place row used in every list: cover, layer colour, category, trust badge and
 * layer-specific meta (event date and price, issue stage, rating).
 */
export function PlaceListItem({
  place,
  distanceM,
  onSelect,
  selected = false,
  trailing,
  hideArea = false,
  forYou = false,
  className,
}: PlaceListItemProps) {
  const { byId } = useCategories();
  const { openPlace } = usePlaceParam();
  const category = byId.get(place.category_id);
  const layer = LAYER_META[place.layer];
  const location = [distanceM !== undefined ? formatDistance(distanceM) : null, place.address]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      className={cn(
        'group relative flex gap-3 rounded-card border bg-surface p-2.5 transition-[border-color,box-shadow,scale] duration-150 has-[h3>button:active]:scale-[0.98]',
        selected
          ? 'border-brand shadow-card'
          : 'border-line/70 hover:border-ink-faint/50 hover:shadow-card',
        className,
      )}
    >
      <div className="relative shrink-0">
        <PlacePhoto
          src={place.cover_url}
          credit={place.cover_credit}
          source={place.cover_source}
          layer={place.layer}
          slug={category?.slug}
          alt={place.title}
          className="size-[76px] rounded-control"
        />
        <span
          aria-hidden
          className={cn(
            'absolute -top-1 -left-1 size-3.5 rounded-full border-2 border-surface',
            TONES[place.layer].fill,
          )}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <span className={cn('max-w-[65%] shrink-0 truncate', TONES[place.layer].text)}>
            {category?.name ?? layer.label}
          </span>
          {place.area && !hideArea && (
            <span className="flex min-w-0 shrink items-center gap-1 text-ink-faint">
              <LandPlot size={12} aria-hidden className="shrink-0" />
              <span className="truncate">{place.area.title}</span>
            </span>
          )}
          {forYou && (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-brand">
              <ForYouMark size={14} />
              для вас
            </span>
          )}
        </p>
        <h3 className="line-clamp-2 text-base leading-tight font-semibold text-ink">
          <button
            type="button"
            onClick={() => (onSelect ? onSelect(place) : openPlace(place.id))}
            className="text-left after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
          >
            {place.title}
          </button>
        </h3>
        {place.layer === 'event' && <EventMeta place={place} />}
        {location && (
          <p className="flex items-center gap-1 truncate text-sm text-ink-soft">
            <MapPin size={13} aria-hidden className="shrink-0 text-ink-faint" />
            <span className="truncate">{location}</span>
          </p>
        )}
        {place.layer === 'issue' && <IssueMeta place={place} />}
        <div className="mt-auto flex items-center gap-2 pt-0.5">
          {place.external && isUnconfirmedImport(place) ? (
            <ExternalBadge external={place.external} />
          ) : (
            // Live imports carry their source badge above; a confirmed map or guide object is ordinary.
            (!place.external ||
              place.external.source === 'osm' ||
              place.external.source === 'wikivoyage') && <TrustBadge status={place.status} />
          )}
          <ListRating item={place} />
        </div>
      </div>
      {trailing && <div className="relative z-10 flex shrink-0 items-start">{trailing}</div>}
    </article>
  );
}
