import type { CombinedRating, CombinedRatingPart, ExternalRating } from '@/shared/api';

import type { ExternalReviews } from './api';

export interface RatedItem {
  combined_rating?: CombinedRating | null;
  rating_avg: number | null;
  /** Places only; areas average their places' ratings. */
  rating_count?: number;
  external_rating: ExternalRating | null;
}

/**
 * Where the rating comes from, ours first: the server's parts of the combined rating when it
 * has one, otherwise our average plus what the card already knows from the sources.
 */
export function ratingParts(
  item: RatedItem,
  summary: ExternalReviews | undefined,
): CombinedRatingPart[] {
  const combined = item.combined_rating?.parts ?? [];
  if (item.combined_rating && combined.length > 0) return combined;

  const parts: CombinedRatingPart[] = [];
  if (item.rating_avg !== null && item.rating_count !== 0) {
    parts.push({ source: 'mayak', rating: item.rating_avg, count: item.rating_count ?? null });
  }
  for (const source of summary?.enabled ? summary.sources : []) {
    if (source.rating === null) continue;
    parts.push({
      source: source.source,
      rating: source.rating,
      count: source.ratings_count ?? source.reviews_count,
    });
  }
  const twoGis = item.external_rating;
  if (twoGis && !parts.some((part) => part.source === '2gis')) {
    parts.push({ source: '2gis', rating: twoGis.rating, count: twoGis.count });
  }
  return parts;
}
