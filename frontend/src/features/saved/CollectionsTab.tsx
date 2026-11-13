import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { useAuth } from '@/features/auth';
import { ErrorState, PRESS_SCALE, TWEEN } from '@/shared/ui';

import { CollectionDialog } from './CollectionDialog';
import { CollectionGrid, CollectionGridSkeleton } from './CollectionGrid';
import { PublicCollections } from './PublicCollections';
import { useMyCollections } from './useCollections';

function NewCollectionTile({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: PRESS_SCALE }}
      transition={TWEEN.fast}
      onClick={onClick}
      className="flex size-full min-h-44 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-canvas/60 p-3 text-center text-sm font-semibold text-ink transition-colors hover:border-brand/40 hover:bg-brand-soft/60"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-beam text-ink shadow-card">
        <Plus size={22} aria-hidden />
      </span>
      Новая подборка
      <span className="text-xs font-normal text-ink-soft">Соберите места по теме</span>
    </motion.button>
  );
}

/** «Подборки»: my collections (with a create tile) and collections made by other residents. */
export function CollectionsTab() {
  const { user } = useAuth();
  const mine = useMyCollections();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2.5 text-sm font-semibold text-ink">Мои подборки</h2>
        {mine.isPending ? (
          <CollectionGridSkeleton count={2} />
        ) : mine.isError ? (
          <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
        ) : (
          <CollectionGrid
            label="Мои подборки"
            collections={mine.data}
            showOwner={false}
            leading={<NewCollectionTile onClick={() => setCreating(true)} />}
          />
        )}
      </section>
      <PublicCollections excludeOwnerId={user?.id} />
      <CollectionDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
