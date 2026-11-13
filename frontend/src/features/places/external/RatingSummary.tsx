import { ChevronDown, Star } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { formatCompact, formatRating, plural, PLURALS } from '@/shared/lib/format';
import { shownRating } from '@/shared/lib/rating';
import { Popover } from '@/shared/ui';

import type { ExternalReviewsTarget } from './api';
import { RatingBreakdown } from './RatingBreakdown';
import { ratingParts, type RatedItem } from './ratingParts';
import { SourceMark } from './SourceMark';
import { sourceName } from './sources';
import { useExternalSummary } from './useExternalReviews';

interface RatingSummaryProps {
  item: RatedItem;
  /** `null` — the object is not looked up at other services. */
  target: ExternalReviewsTarget | null;
  /** What our own part means: «оценка жителей», «средняя оценка мест внутри». */
  ownLabel: string;
  className?: string;
}

/**
 * The one rating line of a card, under its title. With a combined rating: «★ 4,6 · 54 тыс.
 * оценок» and the marks of everyone behind it; until then each source's rating behind its mark.
 * A tap opens the breakdown. Reads only what the server has cached — never a lookup.
 */
export function RatingSummary({ item, target, ownLabel, className }: RatingSummaryProps) {
  const { data } = useExternalSummary(target);
  const parts = ratingParts(item, data);
  const shown = shownRating(item);
  const combined = shown?.combined ? shown : null;
  if (parts.length === 0 && !combined) return null;

  const label = combined
    ? `Оценка по Маяку и картам ${formatRating(combined.value)} — подробнее`
    : `Оценки: ${parts.map((part) => `${sourceName(part.source)} ${formatRating(part.rating)}`).join(', ')} — подробнее`;

  return (
    <Popover
      placement="bottom-start"
      label="Откуда оценка"
      className="w-[340px]"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={label}
          className={cn(
            'tap-target relative inline-flex max-w-full items-center gap-2.5 self-start rounded-full border border-line bg-surface py-1 pr-2 pl-1.5 text-sm text-ink-soft hover:border-ink-faint/50',
            combined && 'pl-2.5',
            className,
          )}
        >
          {combined ? (
            <>
              <span className="flex shrink-0 items-center gap-1 font-semibold text-ink">
                <Star size={14} aria-hidden className="fill-beam text-beam" />
                {formatRating(combined.value)}
              </span>
              <span className="flex shrink-0 -space-x-1">
                {parts.map((part) => (
                  <SourceMark
                    key={part.source}
                    source={part.source}
                    size={18}
                    className="rounded-full ring-2 ring-surface"
                  />
                ))}
              </span>
              {combined.count !== null && (
                <span className="truncate">
                  {formatCompact(combined.count)} {plural(combined.count, PLURALS.rating)}
                </span>
              )}
            </>
          ) : (
            <>
              {parts.map((part) => (
                <span
                  key={part.source}
                  className="flex shrink-0 items-center gap-1 font-semibold text-ink"
                >
                  <SourceMark source={part.source} size={18} />
                  {formatRating(part.rating)}
                </span>
              ))}
              <Star size={13} aria-hidden className="-ml-1.5 shrink-0 fill-beam text-beam" />
            </>
          )}
          <ChevronDown size={14} aria-hidden className="shrink-0 text-ink-faint" />
        </button>
      )}
    >
      <RatingBreakdown combined={combined} parts={parts} ownLabel={ownLabel} />
    </Popover>
  );
}
