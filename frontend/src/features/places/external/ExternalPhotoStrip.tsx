import { useState } from 'react';

import { Lightbox, type ViewerPhoto } from '@/shared/ui';

import { useWorkingPhotos } from './useWorkingPhotos';

/** The sources' own photos of the place, hot-linked; a tap opens the viewer. */
export function ExternalPhotoStrip({ photos }: { photos: readonly ViewerPhoto[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const { visible, drop } = useWorkingPhotos(photos);
  if (visible.length === 0) return null;

  return (
    <>
      <ul
        data-sheet-ignore
        aria-label="Фото из других сервисов"
        className="-mx-4 no-scrollbar flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 lg:-mx-5 lg:scroll-px-5 lg:px-5"
      >
        {visible.map((photo, i) => (
          <li key={photo.url} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Открыть фото ${i + 1} из ${visible.length}`}
              className="block h-24 w-32 overflow-hidden rounded-control bg-line transition-transform duration-150 active:scale-[0.97]"
            >
              <img
                src={photo.url}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => drop(photo.url)}
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox
        photos={visible}
        index={index}
        onIndexChange={setIndex}
        alt="Фото из других сервисов"
      />
    </>
  );
}
