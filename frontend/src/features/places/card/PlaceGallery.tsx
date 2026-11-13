import { useState } from 'react';

import type { PlaceDetail } from '@/shared/api';
import {
  Lightbox,
  OnReviewMark,
  PhotoCreditLink,
  PlacePhoto,
  Spinner,
  type ViewerPhoto,
} from '@/shared/ui';

import { externalTarget, isExternalReviewsTarget } from '../external/api';
import { ExternalPhotos, SourceCredit } from '../external/ExternalPhotos';
import { useExternalPhotos, useExternalReviews } from '../external/useExternalReviews';
import { useWorkingPhotos } from '../external/useWorkingPhotos';

interface PlaceGalleryProps {
  place: PlaceDetail;
}

/**
 * The cover of imported content (an event poster hot-linked from its source) or the one borrowed
 * from a map service — what the card shows while nobody has added photos; lists show the same
 * image.
 */
function importedCover(place: PlaceDetail): ViewerPhoto[] {
  if (!place.cover_url) return [];
  if (place.cover_source) {
    const { label, url } = place.cover_source;
    return [{ url: place.cover_url, source: { label, url } }];
  }
  const source = place.external && { label: place.external.label, url: place.external.url };
  return [{ url: place.cover_url, credit: place.cover_credit, source }];
}

/** Shown while the map services are still being asked: the photos are on their way. */
function CollectingNote() {
  return (
    <p role="status" className="mx-4 mt-2 flex items-center gap-1.5 text-xs text-ink-soft lg:mx-5">
      <Spinner size={12} />
      Собираем фото из Яндекс Карт, 2ГИС и Google — появятся здесь через несколько секунд
    </p>
  );
}

/**
 * Swipeable photo strip at the top of the card; a tap opens the lightbox. Residents' and archive
 * photos come first, the map services' photos after them, each with its service's mark. While
 * the services are being asked (the first opening of a card), a line under the strip says so.
 */
export function PlaceGallery({ place }: PlaceGalleryProps) {
  const target = externalTarget('place', place);
  const asked = isExternalReviewsTarget(place);
  // The same lookup the reviews list runs — one request, shared through the query cache.
  const lookup = useExternalReviews(asked ? target : null, asked);
  const collecting = asked && (lookup.isPending || Boolean(lookup.data?.pending));
  return (
    <div>
      <GalleryStrip place={place} />
      {collecting && <CollectingNote />}
    </div>
  );
}

function GalleryStrip({ place }: PlaceGalleryProps) {
  const [index, setIndex] = useState<number | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const external = useExternalPhotos(
    externalTarget('place', place),
    isExternalReviewsTarget(place),
  );
  const ownUrls = new Set(place.photos.map((photo) => photo.url));
  /** The viewer's own photos that did not pass the automatic check (SPEC §24.1). */
  const onReview = new Set(
    place.photos.filter((photo) => photo.on_review).map((photo) => photo.url),
  );
  const { visible: photos, drop } = useWorkingPhotos(
    place.photos.length > 0
      ? [...place.photos, ...external.filter((photo) => !ownUrls.has(photo.url))]
      : importedCover(place),
  );

  if (place.photos.length === 0 && (external.length > 0 || place.cover_source)) {
    const shown = external.length > 0 ? external : importedCover(place);
    return <ExternalPhotos photos={shown} alt={place.title} variant="strip" />;
  }
  // A hot-linked cover that no longer loads gives way to the placeholder.
  if (photos.length === 0 || (place.photos.length === 0 && photos[0]?.url === failedUrl)) {
    return (
      <PlacePhoto
        src={null}
        layer={place.layer}
        slug={place.category.slug}
        alt={place.title}
        className="mx-4 h-28 rounded-card lg:mx-5"
      />
    );
  }

  return (
    <>
      <div className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 lg:scroll-px-5 lg:px-5">
        {photos.map((photo, i) => (
          <div
            key={photo.id ?? photo.url}
            className="relative h-48 shrink-0 snap-start overflow-hidden rounded-card bg-canvas"
            style={{ width: photos.length === 1 ? '100%' : '82%' }}
          >
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Открыть фото ${i + 1} из ${photos.length}`}
              className="block size-full"
            >
              <img
                src={photo.url}
                alt={`${place.title} — фото ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                referrerPolicy={photo.source && !photo.credit ? 'no-referrer' : undefined}
                onError={() =>
                  place.photos.length > 0 ? drop(photo.url) : setFailedUrl(photo.url)
                }
                className="size-full object-cover"
              />
            </button>
            {photo.credit && (
              <PhotoCreditLink
                credit={photo.credit}
                className="absolute bottom-2 left-2 max-w-[calc(100%-5rem)]"
              />
            )}
            {!photo.credit && place.photos.length > 0 && (
              <SourceCredit photo={photo} className="bottom-2 left-2" />
            )}
            {onReview.has(photo.url) && (
              <OnReviewMark className="absolute top-2 left-2 max-w-[calc(100%-1rem)]" />
            )}
            {photos.length > 1 && (
              <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-ink/60 px-2 py-0.5 text-xs font-medium text-white">
                {i + 1} / {photos.length}
              </span>
            )}
          </div>
        ))}
      </div>
      <Lightbox photos={photos} index={index} onIndexChange={setIndex} alt={place.title} />
    </>
  );
}
