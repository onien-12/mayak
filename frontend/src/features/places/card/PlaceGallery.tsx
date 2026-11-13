import { useState } from 'react';

import type { PlaceDetail } from '@/shared/api';
import { Lightbox, PhotoCreditLink, PlacePhoto, type ViewerPhoto } from '@/shared/ui';

import { externalTarget, isExternalReviewsTarget } from '../external/api';
import { ExternalPhotos } from '../external/ExternalPhotos';
import { useExternalPhotos } from '../external/useExternalReviews';

interface PlaceGalleryProps {
  place: PlaceDetail;
}

/**
 * The cover of imported content (an event poster hot-linked from its source) — what the card
 * shows while nobody has added photos; lists show the same image.
 */
function importedCover(place: PlaceDetail): ViewerPhoto[] {
  if (!place.cover_url) return [];
  const source = place.external && { label: place.external.label, url: place.external.url };
  return [{ url: place.cover_url, credit: place.cover_credit, source }];
}

/** Swipeable photo strip at the top of the card; a tap opens the lightbox. */
export function PlaceGallery({ place }: PlaceGalleryProps) {
  const [index, setIndex] = useState<number | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photos: readonly ViewerPhoto[] =
    place.photos.length > 0 ? place.photos : importedCover(place);
  const external = useExternalPhotos(
    externalTarget('place', place),
    place.photos.length === 0 && isExternalReviewsTarget(place),
  );

  if (place.photos.length === 0 && external.length > 0) {
    return <ExternalPhotos photos={external} alt={place.title} variant="strip" />;
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
                onError={() => setFailedUrl(photo.url)}
                className="size-full object-cover"
              />
            </button>
            {photo.credit && (
              <PhotoCreditLink
                credit={photo.credit}
                className="absolute bottom-2 left-2 max-w-[calc(100%-5rem)]"
              />
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
