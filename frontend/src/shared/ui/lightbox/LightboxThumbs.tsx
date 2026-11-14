import { useEffect, useRef } from 'react';

import { cn } from '../../lib/cn';
import type { ViewerPhoto } from './types';

const DOTS_MAX = 10;

interface LightboxThumbsProps {
  photos: readonly ViewerPhoto[];
  index: number;
  onSelect: (index: number) => void;
}

/** Desktop: a strip of thumbnails to jump to any photo. Phones: quiet dots for short sets. */
export function LightboxThumbs({ photos, index, onSelect }: LightboxThumbsProps) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = strip.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !current) return;
    // Only the strip scrolls: `scrollIntoView` would also shift the whole viewer sideways.
    const offset = current.getBoundingClientRect().left - row.getBoundingClientRect().left;
    row.scrollTo({ left: row.scrollLeft + offset - (row.clientWidth - current.clientWidth) / 2 });
  }, [index]);

  return (
    <>
      <div
        ref={strip}
        role="group"
        aria-label="Все фото"
        className="pointer-events-auto no-scrollbar hidden max-w-[min(100%,720px)] gap-1.5 overflow-x-auto rounded-control bg-ink/50 p-1.5 md:flex"
      >
        {photos.map((photo, i) => (
          <button
            key={`${i}:${photo.url}`}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Фото ${i + 1}`}
            aria-current={i === index}
            className={cn(
              'size-12 shrink-0 overflow-hidden rounded-lg bg-white/10 transition-opacity duration-150',
              i === index ? 'opacity-100 ring-2 ring-beam' : 'opacity-55 hover:opacity-90',
            )}
          >
            <img
              src={photo.url}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
      {photos.length <= DOTS_MAX && (
        <div
          aria-hidden
          className="flex items-center gap-1.5 rounded-full bg-ink/60 px-3 py-2 md:hidden"
        >
          {photos.map((photo, i) => (
            <span
              key={`${i}:${photo.url}`}
              className={cn(
                'size-1.5 rounded-full transition-[background-color,transform] duration-200',
                i === index ? 'scale-125 bg-white' : 'bg-white/40',
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
