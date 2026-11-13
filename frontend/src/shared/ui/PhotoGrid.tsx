import { useState } from 'react';

import type { Photo } from '../api/types';
import { cn } from '../lib/cn';
import { Lightbox } from './Lightbox';
import { CreditMark } from './PhotoCredit';

interface PhotoGridProps {
  photos: readonly Photo[];
  alt: string;
  /** Thumbnails shown before the «+N» tile. */
  max?: number;
  className?: string;
}

/** Square thumbnails that open the lightbox. */
export function PhotoGrid({ photos, alt, max = 6, className }: PhotoGridProps) {
  const [index, setIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;

  const visible = photos.slice(0, max);
  const hidden = photos.length - visible.length;

  return (
    <>
      <div className={cn('grid grid-cols-3 gap-1.5', className)}>
        {visible.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Открыть фото ${i + 1}`}
            className="group relative aspect-square overflow-hidden rounded-control bg-canvas"
          >
            <img
              src={photo.url}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            {photo.credit && <CreditMark credit={photo.credit} />}
            {hidden > 0 && i === visible.length - 1 && (
              <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-lg font-semibold text-white">
                +{hidden}
              </span>
            )}
          </button>
        ))}
      </div>
      <Lightbox photos={photos} index={index} onIndexChange={setIndex} alt={alt} />
    </>
  );
}
