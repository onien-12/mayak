import { Star } from 'lucide-react';

import type { CombinedRating } from '../api/types';
import { cn } from '../lib/cn';
import { formatCompact, formatRating } from '../lib/format';
import { shownRating } from '../lib/rating';

interface ListRatingProps {
  item: {
    combined_rating?: CombinedRating | null;
    rating_avg: number | null;
    rating_count?: number;
  };
  /** What our own average means when there is no combined rating. */
  ownLabel?: string;
  className?: string;
}

/**
 * «★ 4,6 (54 тыс.)» on list items: the combined rating when the server has one, otherwise
 * ours; its origin is named on hover and to screen readers.
 */
export function ListRating({ item, ownLabel = 'Оценка жителей', className }: ListRatingProps) {
  const shown = shownRating(item);
  if (!shown) return null;
  const label = shown.combined ? 'Оценка по Маяку и картам' : ownLabel;
  return (
    <span
      title={label}
      className={cn('flex shrink-0 items-center gap-1 text-xs font-semibold text-ink', className)}
    >
      <Star size={13} aria-hidden className="fill-beam text-beam" />
      <span className="sr-only">{label}:</span>
      {formatRating(shown.value)}
      {shown.count !== null && (
        <span className="font-normal text-ink-faint">({formatCompact(shown.count)})</span>
      )}
    </span>
  );
}
