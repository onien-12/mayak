import { useState } from 'react';

import { ForYouMark, TopicChips } from '@/features/interests';
import { useAreaParam } from '@/features/map';
import type { AreaCard } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { AREA_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { CategoryGlyph, CoverSourceMark, CreditMark, ListRating } from '@/shared/ui';

import { AreaPlaceholder } from '../card/AreaCover';
import { InterestMeter } from '../card/InterestMeter';
import { shownInterest } from '../lib/interest';

const HIGHLIGHT_ICONS = 4;

/** Cover photo of an area, or its designed placeholder (lists, «Для вас»). */
export function AreaThumb({ area }: { area: AreaCard }) {
  const [failed, setFailed] = useState(false);
  if (!area.cover_url || failed) {
    return <AreaPlaceholder area={area} className="size-full rounded-control" />;
  }
  return (
    <span className="relative block size-full overflow-hidden rounded-control">
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

/**
 * Rich list card of an area (explore, search): cover, kind, interest tier with a meter,
 * the count of places and what is inside. With a personal interest (SPEC §23.4) the tier and
 * meter show it, marked «для вас» with the reasons; the general tier stays in the tooltip.
 * Opens the area card.
 */
export function AreaListItem({ area, className }: { area: AreaCard; className?: string }) {
  const { openArea } = useAreaParam();
  const { byId } = useCategories();
  const kind = AREA_KIND_META[area.kind];
  const interest = shownInterest(area);
  const tier = interest.tier;
  const highlights = area.highlights
    .map((item) => byId.get(item.category_id))
    .filter((category) => category !== undefined)
    .slice(0, HIGHLIGHT_ICONS);

  return (
    <article
      className={cn(
        'group relative flex gap-3 rounded-card border border-line/70 bg-surface p-2.5 shadow-card transition-[border-color,scale] duration-150 hover:border-ink-faint/50 has-[h3>button:active]:scale-[0.98]',
        className,
      )}
    >
      <div className="relative size-[88px] shrink-0">
        <AreaThumb area={area} />
        <span
          aria-hidden
          style={{ background: tier.color }}
          className="absolute -bottom-1 -left-1 flex size-7 items-center justify-center rounded-full border-2 border-surface text-white"
        >
          <kind.icon size={14} strokeWidth={2.4} />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 truncate text-xs font-medium">
          <span className="text-ink-soft">{kind.label}</span>
          <span aria-hidden className="text-ink-faint">
            ·
          </span>
          <span
            title={
              interest.personal
                ? `Для вас: ${tier.label.toLowerCase()}. В целом: ${interest.baseTier.label.toLowerCase()}`
                : undefined
            }
            className={cn('truncate font-semibold', TONES[tier.tone].text)}
          >
            {tier.label}
          </span>
          {/* Only where there is a reason: a value merely nudged down is not worth a mark in a list. */}
          {interest.reasons.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-brand">
              <ForYouMark size={14} />
              для вас
            </span>
          )}
        </p>
        <h3 className="line-clamp-2 font-display text-base leading-tight font-semibold text-ink">
          <button
            type="button"
            onClick={() => openArea(area.id)}
            className="text-left after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
          >
            {area.title}
          </button>
        </h3>
        <div className="flex items-center gap-2">
          <InterestMeter interest={interest.value} variant="compact" />
          <span className="text-sm font-semibold text-ink tabular-nums">
            {pluralize(area.places_count, PLURALS.place)}
          </span>
          <ListRating item={area} ownLabel="Средняя оценка мест" className="ml-auto" />
        </div>
        {interest.personal && (
          <TopicChips
            topics={interest.reasons}
            variant="reason"
            max={2}
            label="Почему для вас"
            className="flex-nowrap overflow-hidden"
          />
        )}
        {highlights.length > 0 && (
          <ul aria-label="Что здесь есть" className="mt-auto flex items-center gap-1 pt-0.5">
            {highlights.map((category) => (
              <li
                key={category.id}
                title={category.name}
                className={cn(
                  'flex size-6 items-center justify-center rounded-lg',
                  TONES[category.layer].soft,
                )}
              >
                <CategoryGlyph slug={category.slug} layer={category.layer} size={13} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
