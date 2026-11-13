import { Star } from 'lucide-react';

import type { CombinedRatingPart } from '@/shared/api';
import { formatNumber, formatRating, plural, pluralize, PLURALS } from '@/shared/lib/format';
import type { ShownRating } from '@/shared/lib/rating';
import { RatingStars } from '@/shared/ui';

import { SourceMark } from './SourceMark';
import { sourceFrom, sourceName } from './sources';

interface RatingBreakdownProps {
  combined: ShownRating | null;
  parts: readonly CombinedRatingPart[];
  ownLabel: string;
}

/** Where the rating comes from: the combined value (when there is one) and every part of it. */
export function RatingBreakdown({ combined, parts, ownLabel }: RatingBreakdownProps) {
  const services = parts.filter((part) => part.source !== 'mayak').map((part) => part.source);
  const hasOwn = parts.some((part) => part.source === 'mayak');

  return (
    <div className="flex flex-col gap-3 p-4">
      {combined ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-ink">Оценка по Маяку и картам</p>
          <p className="flex items-center gap-2.5">
            <span className="font-display text-3xl font-semibold text-ink">
              {formatRating(combined.value)}
            </span>
            <RatingStars value={combined.value} size={16} />
          </p>
          {combined.count !== null && (
            <p className="text-xs text-ink-faint">
              {pluralize(combined.count, PLURALS.rating)} вместе
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm font-semibold text-ink">Оценки по источникам</p>
      )}

      <ul className="flex flex-col gap-2">
        {parts.map((part) => (
          <li key={part.source} className="flex items-center gap-2.5 text-sm">
            <SourceMark source={part.source} size={22} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{sourceName(part.source)}</span>
              {part.source === 'mayak' && (
                <span className="block truncate text-xs text-ink-faint">{ownLabel}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 font-semibold text-ink tabular-nums">
              <Star size={13} aria-hidden className="fill-beam text-beam" />
              {formatRating(part.rating)}
            </span>
            <span className="w-24 shrink-0 text-right text-xs text-ink-faint tabular-nums">
              {part.count !== null
                ? `${formatNumber(part.count)} ${plural(part.count, PLURALS.rating)}`
                : 'нет данных'}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-soft">
        {!combined
          ? 'Каждый сервис считает оценку по-своему, поэтому показываем их рядом, не смешивая.'
          : services.length > 0
            ? `Это не только мнение жителей: сюда входят ${hasOwn ? 'отзывы в Маяке и ' : ''}рейтинги ${services.map(sourceFrom).join(', ')}.`
            : 'Пока она складывается только из отзывов в Маяке.'}
      </p>
    </div>
  );
}
