import type { CombinedRating } from '../api/types';

export interface ShownRating {
  value: number;
  /** Ratings behind the value; `null` when unknown. */
  count: number | null;
  /** True for the blend of our reviews and the catalogues — never call it the residents' rating. */
  combined: boolean;
}

/**
 * The star rating of a place or an area: the combined rating when the server has one,
 * otherwise our own average as before. `null` when there is nothing to show.
 */
export function shownRating(item: {
  combined_rating?: CombinedRating | null;
  rating_avg: number | null;
  rating_count?: number;
}): ShownRating | null {
  const combined = item.combined_rating;
  if (combined && Number.isFinite(combined.value) && combined.value > 0) {
    return { value: combined.value, count: combined.count, combined: true };
  }
  if (item.rating_avg === null || item.rating_count === 0) return null;
  return { value: item.rating_avg, count: item.rating_count ?? null, combined: false };
}
