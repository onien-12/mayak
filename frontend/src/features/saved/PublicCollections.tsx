import { Library } from 'lucide-react';

import { EmptyState, ErrorState } from '@/shared/ui';

import { CollectionGrid, CollectionGridSkeleton } from './CollectionGrid';
import { usePublicCollections } from './useCollections';

/** «Подборки жителей» — public collections to discover (own ones are listed separately). */
export function PublicCollections({ excludeOwnerId }: { excludeOwnerId?: number }) {
  const collections = usePublicCollections();
  const others = collections.data?.filter(({ owner }) => owner.id !== excludeOwnerId) ?? [];

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-ink">Подборки жителей</h2>
      <p className="mb-2.5 text-xs text-ink-soft">Идеи для прогулок от тех, кто знает город</p>
      {collections.isPending ? (
        <CollectionGridSkeleton />
      ) : collections.isError ? (
        <ErrorState error={collections.error} onRetry={() => void collections.refetch()} />
      ) : others.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Пока пусто"
          description="Сделайте свою подборку публичной — она появится здесь."
        />
      ) : (
        <CollectionGrid label="Подборки жителей" collections={others} />
      )}
    </section>
  );
}
