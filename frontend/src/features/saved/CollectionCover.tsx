import { Bookmark } from 'lucide-react';

import type { Collection } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { PlacePhoto, Skeleton } from '@/shared/ui';

import { useCollection } from './useCollections';

const MOSAIC_SIZE = 4;

const TILE_LAYOUT: Record<number, string[]> = {
  1: ['col-span-2 row-span-2'],
  2: ['row-span-2', 'row-span-2'],
  3: ['row-span-2', '', ''],
  4: ['', '', '', ''],
};

function EmptyCover({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-brand-soft text-brand',
        className,
      )}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <path d="M0 100 100 12V56Z" fill="var(--color-beam)" opacity="0.35" />
      </svg>
      <Bookmark size={28} strokeWidth={1.6} className="relative" />
    </div>
  );
}

/** Cover of a collection: its own image, or a mosaic of the first places' photos. */
export function CollectionCover({
  collection,
  className,
}: {
  collection: Collection;
  className?: string;
}) {
  const { byId } = useCategories();
  const detail = useCollection(collection.id, !collection.cover_url && collection.items_count > 0);

  if (collection.cover_url) {
    return (
      <img
        src={collection.cover_url}
        alt=""
        loading="lazy"
        className={cn('bg-canvas object-cover', className)}
      />
    );
  }
  if (collection.items_count === 0 || detail.isError) return <EmptyCover className={className} />;
  if (!detail.data) return <Skeleton className={cn('rounded-none', className)} />;

  const places = detail.data.places.slice(0, MOSAIC_SIZE);
  if (places.length === 0) return <EmptyCover className={className} />;
  const layout = TILE_LAYOUT[places.length] ?? [];

  return (
    <div aria-hidden className={cn('grid grid-cols-2 grid-rows-2 gap-0.5 bg-surface', className)}>
      {places.map((place, index) => (
        <PlacePhoto
          key={place.id}
          src={place.cover_url}
          credit={place.cover_credit}
          source={place.cover_source}
          layer={place.layer}
          slug={byId.get(place.category_id)?.slug}
          alt=""
          className={cn('size-full min-h-0', layout[index])}
        />
      ))}
    </div>
  );
}
