import { BadgeCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { ForYouMark } from '@/features/interests';
import { usePlaceParam } from '@/features/map';
import type { PlaceCard } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { capitalize, formatDateTime, formatDistance, formatPrice } from '@/shared/lib/format';
import { isUnconfirmedImport } from '@/shared/lib/imports';
import { ISSUE_STAGE_META, LAYER_META, PHASE_META, STATUS_META } from '@/shared/lib/labels';
import { Badge, ListCard, ListMark, ListRating, PlacePhoto } from '@/shared/ui';

interface PlaceListItemProps {
  place: PlaceCard;
  /** Shown before the address («350 м»). */
  distanceM?: number;
  /** Defaults to opening the place card (`?place=<id>`). */
  onSelect?: (place: PlaceCard) => void;
  selected?: boolean;
  /** Extra controls on the right (remove from collection, reorder…). */
  trailing?: ReactNode;
  /** Leave out the area name — the list is already inside that area's card. */
  hideArea?: boolean;
  /** Recommended to the viewer: a quiet «для вас» mark instead of the trust mark. */
  forYou?: boolean;
  /** Leads the meta line instead of the category («сообщили 2 дня назад»). */
  note?: string;
  className?: string;
}

/**
 * Trust in a list, only where it tells something: verified by residents (quiet), needs a check
 * (warning), the author's own one awaiting moderation. Imports keep their source on the card.
 */
function TrustMark({ place }: { place: PlaceCard }) {
  const ownBaseline =
    !place.external || place.external.source === 'osm' || place.external.source === 'wikivoyage';
  if (!ownBaseline || isUnconfirmedImport(place)) return null;
  const meta = STATUS_META[place.status];
  if (place.status === 'verified') {
    return (
      <ListMark icon={BadgeCheck} tone="success" title={`${meta.label}. ${meta.description}`}>
        {/* Short in the list: the card names who checked it. */}
        Проверено<span className="sr-only"> жителями</span>
      </ListMark>
    );
  }
  if (place.status === 'needs_review' || place.status === 'pending') {
    return (
      <Badge tone={meta.tone} icon={meta.icon} title={meta.description}>
        {meta.label}
      </Badge>
    );
  }
  return null;
}

/** The layer's own marks: an event's phase (when it matters) and price, an issue's stage. */
function LayerMarks({ place }: { place: PlaceCard }) {
  if (place.event) {
    const event = place.event;
    const phase = PHASE_META[event.phase];
    return (
      <>
        {event.phase !== 'open' && (
          <Badge tone={phase.tone} icon={phase.icon}>
            {phase.label}
          </Badge>
        )}
        {(event.price !== null || event.price_note) && (
          <ListMark strong>{formatPrice(event.price, event.price_note)}</ListMark>
        )}
      </>
    );
  }
  if (place.issue) {
    const stage = ISSUE_STAGE_META[place.issue.stage];
    return (
      <Badge tone={stage.tone} icon={stage.icon} title={stage.description}>
        {stage.label}
      </Badge>
    );
  }
  return null;
}

/**
 * A place in any list: picture, name, one line «what · how far · where» (an event: when ·
 * where) and the marks that matter — rating and trust, an event's price, an issue's stage.
 * The rest (area, source, facilities, official notes) is on the place card it opens.
 */
export function PlaceListItem({
  place,
  distanceM,
  onSelect,
  selected = false,
  trailing,
  hideArea = false,
  forYou = false,
  note,
  className,
}: PlaceListItemProps) {
  const { byId } = useCategories();
  const { openPlace } = usePlaceParam();
  const category = byId.get(place.category_id);
  const what = place.event
    ? capitalize(formatDateTime(place.event.starts_at))
    : (category?.name ?? LAYER_META[place.layer].label);
  const where = place.address ?? (hideArea ? null : place.area?.title);
  const meta = [note ?? what, distanceM !== undefined ? formatDistance(distanceM) : null, where]
    .filter(Boolean)
    .join(' · ');
  const ownMarks = place.layer === 'event' || place.layer === 'issue';

  return (
    <ListCard
      media={
        <PlacePhoto
          src={place.cover_url}
          credit={place.cover_credit}
          source={place.cover_source}
          layer={place.layer}
          slug={category?.slug}
          alt={place.title}
          className="size-full"
        />
      }
      title={place.title}
      onSelect={() => (onSelect ? onSelect(place) : openPlace(place.id))}
      meta={meta}
      marks={
        <>
          {ownMarks ? <LayerMarks place={place} /> : <ListRating item={place} />}
          {forYou ? (
            <ListMark className="text-brand">
              <span className="flex items-center gap-1">
                <ForYouMark size={15} />
                для вас
              </span>
            </ListMark>
          ) : (
            !ownMarks && <TrustMark place={place} />
          )}
        </>
      }
      trailing={trailing}
      highlight={selected && 'brand'}
      className={className}
    />
  );
}
