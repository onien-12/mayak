import { useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { Lightbox, type ViewerPhoto } from '@/shared/ui';

import { useWorkingPhotos } from './useWorkingPhotos';

interface ExternalPhotosProps {
  /** Hot-linked photos, each with the service to credit («Фото: Яндекс Карты»). */
  photos: readonly ViewerPhoto[];
  alt: string;
  /** `strip` — the place gallery; `cover` — one image filling the area cover. */
  variant: 'strip' | 'cover';
  className?: string;
}

function SourceCredit({ photo, className }: { photo: ViewerPhoto; className: string }) {
  if (!photo.source) return null;
  return (
    <a
      href={photo.source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'absolute max-w-[calc(100%-1rem)] truncate rounded-full bg-ink/55 px-2 py-1 text-2xs leading-tight text-white/90 backdrop-blur-sm hover:text-white lite:bg-ink/70',
        className,
      )}
    >
      Фото: {photo.source.label}
    </a>
  );
}

/**
 * The sources' own photos as a fallback for a card without any photos of ours. Hot-linked
 * (never stored, never a list cover), always credited; a tap opens the viewer.
 */
export function ExternalPhotos({ photos, alt, variant, className }: ExternalPhotosProps) {
  const [index, setIndex] = useState<number | null>(null);
  const { visible, drop } = useWorkingPhotos(photos);
  const shown = variant === 'cover' ? visible.slice(0, 1) : visible;
  if (shown.length === 0) return null;

  return (
    <div
      data-sheet-ignore
      className={cn(
        variant === 'strip'
          ? 'no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 lg:scroll-px-5 lg:px-5'
          : 'relative',
        className,
      )}
    >
      {shown.map((photo, i) => (
        <div
          key={photo.url}
          style={variant === 'strip' ? { width: shown.length === 1 ? '100%' : '82%' } : undefined}
          className={cn(
            'relative overflow-hidden bg-canvas',
            variant === 'strip' ? 'h-48 shrink-0 snap-start rounded-card' : 'size-full',
          )}
        >
          <button
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Открыть фото ${i + 1} из ${visible.length}`}
            className="block size-full"
          >
            <img
              src={photo.url}
              alt={`${alt} — фото ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => drop(photo.url)}
              className="size-full object-cover"
            />
          </button>
          <SourceCredit
            photo={photo}
            className={variant === 'strip' ? 'bottom-2 left-2' : 'top-2 right-2'}
          />
        </div>
      ))}
      <Lightbox photos={visible} index={index} onIndexChange={setIndex} alt={alt} />
    </div>
  );
}
