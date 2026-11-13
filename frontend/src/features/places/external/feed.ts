import type { RatingSource, Review } from '@/shared/api';

import type { ExternalReview, ExternalReviewSource, ReviewSourceName } from './api';

/** Our newest reviews pinned on top of the mixed list. */
export const PINNED_OWN = 5;

export type FeedEntry =
  | { kind: 'own'; key: string; origin: 'mayak'; review: Review }
  | { kind: 'external'; key: string; origin: ReviewSourceName; review: ExternalReview };

export type FeedFilter = RatingSource | 'all';

/** Where a page loaded by «Загрузить ещё» starts in its source's reviews. */
export interface LoadedPage {
  source: ReviewSourceName;
  from: number;
}

const newestFirst = (reviews: readonly Review[]) =>
  [...reviews].sort((a, b) => b.created_at.localeCompare(a.created_at));

const ownEntry = (review: Review): FeedEntry => ({
  kind: 'own',
  key: `own-${review.id}`,
  origin: 'mayak',
  review,
});

const externalEntries = (source: ExternalReviewSource, from: number, to: number): FeedEntry[] =>
  source.reviews.slice(from, to).map((review, offset) => ({
    kind: 'external',
    key: `${source.source}-${from + offset}`,
    origin: source.source,
    review,
  }));

/** One entry of each lane in turn, so the top of the list shows every source. */
function inTurns(lanes: FeedEntry[][]): FeedEntry[] {
  const longest = Math.max(0, ...lanes.map((lane) => lane.length));
  const mixed: FeedEntry[] = [];
  for (let position = 0; position < longest; position += 1) {
    for (const lane of lanes) {
      const entry = lane[position];
      if (entry) mixed.push(entry);
    }
  }
  return mixed;
}

/**
 * The external part: what came with the first answer in turns, then every page loaded later
 * in the order it was loaded — so pressing «Загрузить ещё» never reshuffles what is on screen.
 */
function externalFeed(
  sources: readonly ExternalReviewSource[],
  pages: readonly LoadedPage[],
  ownLane: FeedEntry[] = [],
): FeedEntry[] {
  const firstPage = (source: ExternalReviewSource) =>
    pages.find((page) => page.source === source.source)?.from ?? source.reviews.length;
  const mixed = inTurns([
    ownLane,
    ...sources.map((source) => externalEntries(source, 0, firstPage(source))),
  ]);
  const loaded = pages.flatMap((page, index) => {
    const source = sources.find((item) => item.source === page.source);
    if (!source) return [];
    const next = pages.slice(index + 1).find((item) => item.source === page.source);
    return externalEntries(source, page.from, next?.from ?? source.reviews.length);
  });
  return [...mixed, ...loaded];
}

/**
 * The single reviews list: up to five of our newest reviews first, then everything else in
 * turns across the sources (our remaining reviews take part as «Маяк»). A filter shows one
 * source only.
 */
export function buildFeed(
  own: readonly Review[],
  sources: readonly ExternalReviewSource[],
  pages: readonly LoadedPage[],
  filter: FeedFilter,
): FeedEntry[] {
  const ours = newestFirst(own).map(ownEntry);
  if (filter === 'mayak') return ours;
  if (filter !== 'all') {
    return externalFeed(
      sources.filter((source) => source.source === filter),
      pages,
    );
  }
  return [...ours.slice(0, PINNED_OWN), ...externalFeed(sources, pages, ours.slice(PINNED_OWN))];
}
