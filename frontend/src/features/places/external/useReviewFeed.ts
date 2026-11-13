import { useState } from 'react';

import { ApiError, type Review } from '@/shared/api';

import {
  sourcePhotos,
  type ExternalReviewSource,
  type ExternalReviewsTarget,
  type ReviewSourceName,
} from './api';
import { buildFeed, type FeedFilter, type LoadedPage } from './feed';
import type { FilterOption } from './FeedParts';
import { useExternalReviews, useInView, useMoreReviews } from './useExternalReviews';

/** Cards revealed per «Показать ещё». */
export const FEED_PAGE = 10;
const ALL_SOURCES: readonly ReviewSourceName[] = ['yandex', '2gis', 'google'];

export interface OwnReviews {
  reviews: readonly Review[];
  /** Our average, for the «Маяк» chip. */
  rating: number | null;
}

/** The next source to page: the one with the fewest reviews loaded, so the list stays mixed. */
const nextToLoad = (sources: readonly ExternalReviewSource[]) =>
  sources
    .filter((source) => source.has_more === true)
    .sort((a, b) => a.reviews.length - b.reviews.length)[0] ?? null;

/**
 * State of the single reviews list: the external lookup (lazy on request), the filter, the
 * client-side pages over what is loaded, and «Загрузить ещё» from a source once it runs out.
 */
export function useReviewFeed(
  target: ExternalReviewsTarget | null,
  own: OwnReviews | undefined,
  lazy: boolean,
) {
  const [sentinel, inView] = useInView<HTMLDivElement>(lazy);
  const query = useExternalReviews(target, inView);
  const more = useMoreReviews();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [limit, setLimit] = useState(FEED_PAGE);
  const [pages, setPages] = useState<LoadedPage[]>([]);

  const data = query.data?.enabled ? query.data : undefined;
  const sources = data?.sources ?? [];
  const firstLookup = target !== null && query.isPending;
  const pending: readonly ReviewSourceName[] = firstLookup
    ? ALL_SOURCES
    : data?.pending
      ? (data.pending_sources ?? []).filter((name) => !sources.some((s) => s.source === name))
      : [];

  const ownReviews = own?.reviews ?? [];
  const options: FilterOption[] = [
    ...(ownReviews.length > 0
      ? [{ origin: 'mayak' as const, rating: own?.rating ?? null, count: ownReviews.length }]
      : []),
    ...sources.map((source) => ({
      origin: source.source,
      rating: source.rating,
      count: source.reviews_count ?? source.ratings_count,
    })),
  ];
  const selected = options.some((option) => option.origin === filter) ? filter : 'all';
  const visibleSources =
    selected === 'all' ? sources : sources.filter((source) => source.source === selected);

  const entries = buildFeed(ownReviews, sources, pages, selected);
  const shown = entries.slice(0, limit);
  const loadable = shown.length === entries.length ? nextToLoad(visibleSources) : null;

  const choose = (next: FeedFilter) => {
    setFilter(next);
    setLimit(FEED_PAGE);
    more.reset();
  };
  const loadMore = () => {
    if (!target || !loadable || more.isPending) return;
    const from = loadable.reviews.length;
    const before = entries.length;
    more.mutate(
      { target, source: loadable.source },
      {
        onSuccess: (entry) => {
          const added = entry.source === loadable.source ? entry.reviews.length - from : 0;
          if (added <= 0) return;
          setPages((current) => [...current, { source: loadable.source, from }]);
          setLimit((current) => Math.max(current, before) + added);
        },
      },
    );
  };
  const moreFailed = more.isError && !(more.error instanceof ApiError && more.error.status === 409);

  return {
    sentinel,
    firstLookup,
    /** The lookup is running but the server does not say which services are left. */
    anonymousPending: Boolean(data?.pending) && data?.pending_sources === undefined,
    pending,
    hasSources: sources.length > 0,
    links: data?.links ?? [],
    photos: sourcePhotos(data && { ...data, sources: visibleSources }),
    options,
    selected,
    choose,
    entries,
    shown,
    rest: entries.length - shown.length,
    showMore: () => setLimit((current) => current + FEED_PAGE),
    loadable: loadable?.source ?? null,
    loadMore,
    loading: more.isPending,
    moreFailed,
  };
}
