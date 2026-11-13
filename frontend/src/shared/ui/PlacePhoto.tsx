import { useState } from 'react';

import type { Layer, PhotoCredit } from '../api/types';
import { cn } from '../lib/cn';
import { LAYER_META } from '../lib/labels';
import { TONES } from '../lib/tones';
import { CategoryGlyph } from './CategoryGlyph';
import { CreditMark } from './PhotoCredit';

interface PlacePhotoProps {
  src: string | null | undefined;
  layer: Layer;
  /** Category slug for the placeholder glyph. */
  slug?: string;
  alt: string;
  /** Licence of an external cover photo: a subtle «©» on the image. */
  credit?: PhotoCredit | null;
  className?: string;
}

/**
 * Cover image of a place. Without a photo (or when it fails to load) shows a designed
 * placeholder: the layer tint, a lighthouse beam and the category glyph.
 */
export function PlacePhoto({ src, layer, slug, alt, credit, className }: PlacePhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    const image = (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailedSrc(src)}
        className={cn('bg-canvas object-cover', credit ? 'size-full' : className)}
      />
    );
    if (!credit) return image;
    return (
      <span className={cn('relative block overflow-hidden', className)}>
        {image}
        <CreditMark credit={credit} />
      </span>
    );
  }

  return (
    <div
      role="img"
      aria-label={`${alt} — фото пока нет`}
      className={cn(
        'relative flex items-center justify-center overflow-hidden',
        TONES[layer].soft,
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        <path d="M0 100 100 18V58Z" fill="#fff" opacity="0.55" />
        <path d="M0 100 100 0V18Z" fill="#fff" opacity="0.3" />
      </svg>
      <CategoryGlyph
        slug={slug}
        layer={layer}
        strokeWidth={1.6}
        style={{ color: LAYER_META[layer].color }}
        className="relative size-[38%] max-h-16 max-w-16 min-w-5 opacity-80"
      />
    </div>
  );
}
