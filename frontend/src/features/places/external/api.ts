import { api, type RatingSource } from '@/shared/api';
import type { ViewerPhoto } from '@/shared/ui';

/*
 * Reviews, ratings and photos from external catalogues (SPEC §20), shown together with ours.
 */

export interface ExternalReview {
  rating: number | null;
  text: string;
  published_at: string | null;
}

export type ReviewSourceName = Exclude<RatingSource, 'mayak'>;

export interface ExternalReviewLink {
  source: ReviewSourceName;
  label: string;
  url: string;
}

export interface ExternalReviewSource {
  source: ReviewSourceName;
  label: string;
  url: string;
  rating: number | null;
  ratings_count: number | null;
  reviews_count: number | null;
  reviews: ExternalReview[];
  photos: string[];
  fetched_at: string;
  reviews_available?: boolean;
  /** The source holds more review texts than we have and can page (`/external-reviews/more`). */
  has_more?: boolean;
}

export interface ExternalReviews {
  enabled: boolean;
  sources: ExternalReviewSource[];
  pending?: boolean;
  /** Services still being asked while `pending`. */
  pending_sources?: ReviewSourceName[];
  links?: ExternalReviewLink[];
}

export interface ExternalReviewsTarget {
  type: 'place' | 'area';
  id: number;
  identity: string;
}

/** Editing the viewed object must never reuse reviews fetched for its previous identity. */
export function externalTarget(
  type: ExternalReviewsTarget['type'],
  object: {
    id: number;
    title: string;
    lat: number;
    lng: number;
    object_id: string | null;
    radius_m?: number;
    area?: { id: number; title: string } | null;
    category?: { name: string };
    layer?: string;
  },
): ExternalReviewsTarget {
  return {
    type,
    id: object.id,
    identity: JSON.stringify([
      object.title,
      object.lat,
      object.lng,
      object.object_id,
      object.radius_m,
      object.area?.id,
      object.area?.title,
      object.category?.name,
      object.layer,
    ]),
  };
}

const PATHS: Record<ExternalReviewsTarget['type'], string> = { place: 'places', area: 'areas' };

/** The full answer: a cache miss is a real lookup at the source. */
export const externalReviewsKey = (target: ExternalReviewsTarget) =>
  [
    'experimental',
    'external-reviews',
    'extended-names-v2',
    target.type,
    target.id,
    target.identity,
  ] as const;

/** What the server already knows; never a lookup (the card's summary row and photo fallback). */
export const externalSummaryKey = (target: ExternalReviewsTarget) =>
  [...externalReviewsKey(target), 'cached'] as const;

/** No abort signal on purpose: a started request is a real one at the source, let it land in the cache. */
export const fetchExternalReviews = (target: ExternalReviewsTarget, cachedOnly = false) =>
  api.get<ExternalReviews>(
    `/${PATHS[target.type]}/${target.id}/external-reviews`,
    cachedOnly ? { cached_only: true } : undefined,
  );

/**
 * The next page of one source's reviews: the whole source entry again with the new reviews
 * appended. A real request to the source — only on an explicit press, never retried.
 */
export const fetchMoreReviews = (target: ExternalReviewsTarget, source: ReviewSourceName) =>
  api.get<ExternalReviewSource>(`/${PATHS[target.type]}/${target.id}/external-reviews/more`, {
    source,
  });

/** Every source's hot-linked photos, each credited to its service. */
export function sourcePhotos(reviews: ExternalReviews | undefined): ViewerPhoto[] {
  if (!reviews?.enabled) return [];
  return reviews.sources.flatMap(({ photos, label, url }) =>
    photos.map((photo) => ({ url: photo, source: { label, url } })),
  );
}

/** Sights and named facilities exist as organisations at the source; the server has the final say. */
export function isExternalReviewsTarget(place: {
  layer: string;
  title: string;
  category: { name: string };
}): boolean {
  if (place.layer === 'tourism') return true;
  return place.layer === 'infrastructure' && place.title !== place.category.name;
}
