import { ExternalLink, Star } from 'lucide-react';

import type { RatingSource } from '@/shared/api';
import { formatNumber, formatRating } from '@/shared/lib/format';
import { Chip, Skeleton, Spinner } from '@/shared/ui';

import type { ExternalReviewLink, ReviewSourceName } from './api';
import type { FeedFilter } from './feed';
import { SourceMark } from './SourceMark';
import { sourceName } from './sources';

export interface FilterOption {
  origin: RatingSource;
  rating: number | null;
  count: number | null;
}

interface FeedFiltersProps {
  options: readonly FilterOption[];
  selected: FeedFilter;
  onSelect: (filter: FeedFilter) => void;
  /** Services still being asked: dimmed, with a spinner. */
  pending: readonly ReviewSourceName[];
}

/** «Все», then each source with its rating and count; the ones still loading come last. */
export function FeedFilters({ options, selected, onSelect, pending }: FeedFiltersProps) {
  if (options.length === 0 && pending.length === 0) return null;
  const choosable = options.length > 1;
  return (
    <div
      data-sheet-ignore
      role="group"
      aria-label="Источник отзывов"
      className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 lg:-mx-5 lg:px-5"
    >
      {choosable && (
        <Chip selected={selected === 'all'} onClick={() => onSelect('all')}>
          Все
        </Chip>
      )}
      {options.map(({ origin, rating, count }) => (
        <Chip
          key={origin}
          selected={choosable && selected === origin}
          onClick={choosable ? () => onSelect(origin) : undefined}
        >
          <SourceMark source={origin} size={18} />
          <span className="sr-only">{sourceName(origin)}</span>
          {rating !== null && (
            <span className="flex items-center gap-0.5 font-semibold text-ink">
              <Star size={13} aria-hidden className="fill-beam text-beam" />
              {formatRating(rating)}
            </span>
          )}
          {count !== null && <span className="text-ink-faint">{formatNumber(count)}</span>}
        </Chip>
      ))}
      {pending.map((source) => (
        <span
          key={source}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-sm text-ink-faint lg:h-9"
        >
          <SourceMark source={source} size={18} className="opacity-50" />
          <Spinner size={14} label={`${sourceName(source)}: ищем отзывы`} />
        </span>
      ))}
    </div>
  );
}

export function ReviewSkeletons({ count }: { count: number }) {
  return (
    <div role="status" aria-label="Загрузка отзывов" className="flex flex-col gap-2.5">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-28 rounded-card" />
      ))}
    </div>
  );
}

/** «Читать в Яндекс Картах ↗» — the object's pages at the sources. */
export function SourceLinks({ links }: { links: readonly ExternalReviewLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav aria-label="Читать отзывы в других сервисах" className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.source}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${link.label} (откроется в новой вкладке)`}
          className="tap-target relative inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1.5 pr-3 pl-2 text-sm font-medium text-ink-soft hover:border-ink-faint/60 hover:text-ink"
        >
          <SourceMark source={link.source} size={18} />
          {link.label}
          <ExternalLink size={13} aria-hidden className="text-ink-faint" />
        </a>
      ))}
    </nav>
  );
}
