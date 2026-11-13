import { Info, MessageSquareHeart } from 'lucide-react';

import { Button, EmptyState, Rise } from '@/shared/ui';

import type { ExternalReviewsTarget } from './api';
import { ExternalPhotoStrip } from './ExternalPhotoStrip';
import { FeedFilters, ReviewSkeletons, SourceLinks } from './FeedParts';
import { ReviewCard } from './ReviewCard';
import { sourceFrom } from './sources';
import { FEED_PAGE, useReviewFeed, type OwnReviews } from './useReviewFeed';

interface ReviewFeedProps {
  /** `null` — the object is not looked up at other services: our reviews only. */
  target: ExternalReviewsTarget | null;
  /** Our reviews (places); absent on areas, which have none. */
  own?: OwnReviews;
  currentUserId?: number;
  /** Section title — rendered only when the list has something to show. */
  title?: string;
  /** Under «Отзывов пока нет». */
  emptyHint?: string;
  /** Ask the sources only once the list scrolls near the viewport. */
  lazy?: boolean;
}

/**
 * One list of reviews, each card marked with where it came from: our five newest first, then
 * ours and the other services' in turns. Filter chips per source, ten cards at a time, then
 * «Загрузить ещё» from a service that has more. The services still being asked show as
 * dimmed chips with a spinner.
 */
export function ReviewFeed({
  target,
  own,
  currentUserId,
  title,
  emptyHint,
  lazy = false,
}: ReviewFeedProps) {
  const { sentinel, ...feed } = useReviewFeed(target, own, lazy);
  const lookingUp = feed.firstLookup || feed.anonymousPending || feed.pending.length > 0;
  const empty = feed.entries.length === 0;
  if (!own && empty && !lookingUp && !feed.hasSources && feed.links.length === 0) return null;

  return (
    <Rise ref={sentinel} className="flex flex-col gap-3">
      {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
      <FeedFilters
        options={feed.options}
        selected={feed.selected}
        onSelect={feed.choose}
        pending={feed.pending}
      />
      {feed.hasSources && (
        <p className="-mt-1 flex items-center gap-1 text-xs text-ink-faint">
          <Info size={12} aria-hidden className="shrink-0" />
          Отзывы из других сервисов жители Маяка не проверяли
        </p>
      )}
      <ExternalPhotoStrip photos={feed.photos} />

      {feed.shown.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {feed.shown.map((entry, index) => (
            <ReviewCard
              key={entry.key}
              entry={entry}
              index={index % FEED_PAGE}
              mine={entry.kind === 'own' && entry.review.author.id === currentUserId}
            />
          ))}
        </ul>
      )}
      {empty && !lookingUp && feed.hasSources && (
        <p className="text-sm text-ink-soft">
          Здесь доступен только рейтинг. Тексты отзывов можно прочитать в самом сервисе.
        </p>
      )}
      {empty && !lookingUp && !feed.hasSources && own && (
        <EmptyState
          icon={MessageSquareHeart}
          title="Отзывов пока нет"
          description={emptyHint}
          className="py-6"
        />
      )}
      {lookingUp && feed.rest === 0 && <ReviewSkeletons count={empty ? 2 : 1} />}

      {feed.rest > 0 && (
        <Button variant="secondary" onClick={feed.showMore}>
          Показать ещё {Math.min(FEED_PAGE, feed.rest)}
          {feed.rest > FEED_PAGE && <span className="text-ink-faint">из {feed.rest}</span>}
        </Button>
      )}
      {feed.rest === 0 && feed.loadable && (
        <Button variant="secondary" loading={feed.loading} onClick={feed.loadMore}>
          {feed.loading ? 'Загружаем' : 'Загрузить ещё'} из {sourceFrom(feed.loadable)}
        </Button>
      )}
      {feed.moreFailed && (
        <p role="status" className="text-center text-sm text-ink-soft">
          Не получилось загрузить — попробуйте чуть позже.
        </p>
      )}
      <SourceLinks links={feed.links} />
    </Rise>
  );
}
