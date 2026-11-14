import { useState } from 'react';

import { ForYouMark } from '@/features/interests';
import { useAreaParam } from '@/features/map';
import type { AreaCard, CommunityEventRef } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { AREA_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { CoverSourceMark, CreditMark, ListCard, ListRating } from '@/shared/ui';

import { AreaPlaceholder } from '../card/AreaCover';
import { shownInterest } from '../lib/interest';
import { CommunityEventLine } from './CommunityEventLine';

/** Cover photo of an area, or its designed placeholder (lists, «Для вас»). */
function AreaThumb({ area }: { area: AreaCard }) {
  const [failed, setFailed] = useState(false);
  if (!area.cover_url || failed) {
    return <AreaPlaceholder area={area} className="size-full" />;
  }
  return (
    <span className="relative block size-full">
      <img
        src={area.cover_url}
        alt=""
        loading="lazy"
        referrerPolicy={area.cover_source ? 'no-referrer' : undefined}
        onError={() => setFailed(true)}
        className="size-full bg-canvas object-cover"
      />
      {area.cover_credit && <CreditMark credit={area.cover_credit} />}
      {!area.cover_credit && area.cover_source && <CoverSourceMark source={area.cover_source} />}
    </span>
  );
}

interface AreaListItemProps {
  area: AreaCard;
  /** The residents' event to name instead of the nearest one: what «Для вас» recommends it for. */
  event?: CommunityEventRef | null;
  className?: string;
}

/**
 * An area in a list (explore, «Для вас»): cover, name, «kind · N мест», how interesting it is
 * (personal, marked «для вас», when there are reasons) and the rating; under it the residents'
 * upcoming event inside («Скоро здесь: …», opens it). The meter, topics and what is inside are
 * on the area card it opens.
 */
export function AreaListItem({ area, event, className }: AreaListItemProps) {
  const { openArea } = useAreaParam();
  const kind = AREA_KIND_META[area.kind];
  const interest = shownInterest(area);
  const soon = event ?? area.next_community_event;
  const tier = interest.tier;
  const forYou = interest.reasons.length > 0;

  return (
    <ListCard
      media={<AreaThumb area={area} />}
      title={area.title}
      onSelect={() => openArea(area.id)}
      meta={`${kind.label} · ${pluralize(area.places_count, PLURALS.place)}`}
      marks={
        <>
          <span
            title={
              interest.personal
                ? `Для вас: ${tier.label.toLowerCase()}. В целом: ${interest.baseTier.label.toLowerCase()}`
                : undefined
            }
            className={cn(
              'flex min-w-0 items-center gap-1 text-sm font-semibold',
              TONES[tier.tone].text,
            )}
          >
            {forYou && <ForYouMark size={15} />}
            {forYou && <span className="sr-only">Для вас:</span>}
            <span className="truncate">{tier.label}</span>
          </span>
          <ListRating item={area} ownLabel="Средняя оценка мест" />
        </>
      }
      footer={
        soon && (
          <CommunityEventLine
            event={soon}
            more={area.community_events_upcoming - 1}
            className="self-stretch"
          />
        )
      }
      className={className}
    />
  );
}
