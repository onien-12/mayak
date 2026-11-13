import type { ReactNode } from 'react';

import type { Collection } from '@/shared/api';
import { Skeleton, StaggerItem } from '@/shared/ui';

import { CollectionCard } from './CollectionCard';

interface CollectionGridProps {
  collections: readonly Collection[];
  showOwner?: boolean;
  /** Tile before the collections (e.g. «Новая подборка»). */
  leading?: ReactNode;
  label: string;
}

/** Two-column grid of collection tiles with a staggered entrance. */
export function CollectionGrid({ collections, showOwner, leading, label }: CollectionGridProps) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-2.5">
      {leading && <li>{leading}</li>}
      {collections.map((collection, index) => (
        <StaggerItem key={collection.id} index={index}>
          <CollectionCard collection={collection} showOwner={showOwner} />
        </StaggerItem>
      ))}
    </ul>
  );
}

export function CollectionGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Загрузка" className="grid grid-cols-2 gap-2.5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-card border border-line/70">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-2.5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
