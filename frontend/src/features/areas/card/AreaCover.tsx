import { useState } from 'react';

import { usePlaceParam } from '@/features/map';
import { externalTarget, ExternalPhotos, useExternalPhotos } from '@/features/places';
import type { AreaCard, AreaDetail, CoverSource, PhotoCredit, PlaceCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { AREA_KIND_META, interestLabel } from '@/shared/lib/labels';
import { CoverSourceMark, CreditMark, Lightbox, Pressable, type ViewerPhoto } from '@/shared/ui';

const MOSAIC_SIZE = 3;

/**
 * A photo of the territory itself or the cover of a place inside (captioned with the place);
 * `source` marks a place's cover borrowed from a map service.
 */
type CoverTile = {
  url: string;
  credit: PhotoCredit | null;
  source?: CoverSource | null;
  place: PlaceCard | null;
};

/** The area's own photos first, then photos of different places inside, best places first. */
function coverTiles(area: AreaDetail, places: readonly PlaceCard[]): CoverTile[] {
  const seen = new Set<string>();
  const tiles: CoverTile[] = area.photos.map((photo) => {
    seen.add(photo.url);
    return { url: photo.url, credit: photo.credit, place: null };
  });
  for (const place of places) {
    if (!place.cover_url || seen.has(place.cover_url)) continue;
    seen.add(place.cover_url);
    tiles.push({
      url: place.cover_url,
      credit: place.cover_credit,
      source: place.cover_source,
      place,
    });
  }
  return tiles;
}

interface AreaPlaceholderProps {
  area: AreaCard;
  /** `end`: the icon moves aside to leave room for an overlaid title. */
  iconAt?: 'center' | 'end';
  className?: string;
}

/** Designed placeholder: the interest tint, lighthouse beams and the kind icon. */
export function AreaPlaceholder({ area, iconAt = 'center', className }: AreaPlaceholderProps) {
  const Icon = AREA_KIND_META[area.kind].icon;
  const tier = interestLabel(area.interest);
  return (
    <div
      role="img"
      aria-label={`${area.title} — фото пока нет`}
      style={{ background: `linear-gradient(135deg, ${tier.color}2e, ${tier.color}12)` }}
      className={cn(
        'relative flex items-center overflow-hidden',
        iconAt === 'center' ? 'justify-center' : 'justify-end pr-6',
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        <path d="M0 100 100 12V52Z" fill="#fff" opacity="0.5" />
        <path d="M0 100 100 0V12Z" fill="#fff" opacity="0.28" />
      </svg>
      <Icon
        aria-hidden
        strokeWidth={1.5}
        style={{ color: tier.color }}
        className="relative size-[34%] max-h-16 max-w-16 min-w-6"
      />
    </div>
  );
}

function Mosaic({ tiles, onPhoto }: { tiles: CoverTile[]; onPhoto: (index: number) => void }) {
  const shown = tiles.slice(0, MOSAIC_SIZE);
  const more = tiles.length - shown.length;

  return (
    <div
      className={cn(
        'grid size-full gap-1.5',
        shown.length === 2 && 'grid-cols-2',
        shown.length === 3 && 'grid-cols-[2fr_1fr] grid-rows-2',
      )}
    >
      {shown.map((tile, index) => (
        <Pressable
          key={tile.url}
          className={cn('relative', shown.length === 3 && index === 0 && 'row-span-2')}
        >
          <button
            type="button"
            onClick={() => onPhoto(index)}
            aria-label={
              tile.place
                ? `Фото «${tile.place.title}» — открыть`
                : `Открыть фото ${index + 1} из ${tiles.length}`
            }
            className="block size-full bg-canvas"
          >
            <img
              src={tile.url}
              alt=""
              loading={index === 0 ? 'eager' : 'lazy'}
              referrerPolicy={tile.source ? 'no-referrer' : undefined}
              className="size-full object-cover"
            />
          </button>
          {tile.credit && (
            <CreditMark credit={tile.credit} className="top-1.5 right-1.5 bottom-auto" />
          )}
          {!tile.credit && tile.source && (
            <CoverSourceMark source={tile.source} className="top-1.5 right-1.5 bottom-auto" />
          )}
          {index === shown.length - 1 && more > 0 && (
            <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-ink/60 px-2 py-0.5 text-xs font-medium text-white">
              +{more} фото
            </span>
          )}
        </Pressable>
      ))}
    </div>
  );
}

/**
 * Hero of the area card: a mosaic of the territory's own photos and its places' photos (all
 * open the viewer; a place's photo offers «Открыть место» there), the other services' photos
 * as a fallback, or a designed placeholder — with the kind and the big title laid over it.
 */
export function AreaCover({ area, places }: { area: AreaDetail; places: readonly PlaceCard[] }) {
  const { openPlace } = usePlaceParam();
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const tiles = coverTiles(area, places);
  const kind = AREA_KIND_META[area.kind];
  const fresh = useExternalPhotos(externalTarget('area', area), tiles.length === 0);
  // Without a fresh answer, the cover the server borrowed for the area (SPEC §25) stands in.
  const borrowed: ViewerPhoto[] =
    area.cover_url && area.cover_source
      ? [
          {
            url: area.cover_url,
            source: { label: area.cover_source.label, url: area.cover_source.url },
          },
        ]
      : [];
  const external = fresh.length > 0 ? fresh : borrowed;
  const fallback = tiles.length === 0 && external.length > 0;
  const viewer: ViewerPhoto[] = tiles.map(({ url, credit, source, place }) => ({
    url,
    credit,
    source: source && { label: source.label, url: source.url },
    caption: place?.title,
    action: place ? { label: 'Открыть место', onSelect: () => openPlace(place.id) } : undefined,
  }));
  const photos = tiles.length > 0 || fallback;

  return (
    <div
      className={cn(
        'relative mx-4 overflow-hidden rounded-card lg:mx-5',
        photos ? 'h-40 lg:h-48' : 'h-32',
      )}
    >
      {tiles.length > 0 && <Mosaic tiles={tiles} onPhoto={setPhotoIndex} />}
      {fallback && (
        <ExternalPhotos photos={external} alt={area.title} variant="cover" className="size-full" />
      )}
      {!photos && <AreaPlaceholder area={area} iconAt="end" className="size-full" />}
      {photos && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-ink/75 to-transparent"
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start gap-1.5 p-3.5">
        <span
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold',
            photos ? 'bg-white/20 text-white backdrop-blur-sm' : 'bg-surface/80 text-ink-soft',
          )}
        >
          <kind.icon size={13} aria-hidden />
          {kind.label}
        </span>
        <h2
          className={cn(
            'font-display text-2xl leading-tight font-bold tracking-tight',
            photos ? 'text-white' : 'text-ink',
          )}
        >
          {area.title}
        </h2>
      </div>
      <Lightbox photos={viewer} index={photoIndex} onIndexChange={setPhotoIndex} alt={area.title} />
    </div>
  );
}
