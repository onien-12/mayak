import { Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router';

import type { Collection } from '@/shared/api';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { Avatar, PRESS_SCALE, TWEEN } from '@/shared/ui';

import { CollectionCover } from './CollectionCover';

interface CollectionCardProps {
  collection: Collection;
  /** Hide the owner chip in «Мои подборки». */
  showOwner?: boolean;
}

/** Tile of a collection: mosaic cover, title, number of places, owner, private lock. */
export function CollectionCard({ collection, showOwner = true }: CollectionCardProps) {
  return (
    <motion.div whileTap={{ scale: PRESS_SCALE }} transition={TWEEN.fast} className="h-full">
      <Link
        to={`/collections/${collection.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-card border border-line/70 bg-surface transition-shadow hover:shadow-card"
      >
        <div className="relative">
          <CollectionCover collection={collection} className="aspect-[4/3] w-full" />
          {!collection.is_public && (
            <span className="absolute top-2 left-2 inline-flex h-6 items-center gap-1 rounded-full bg-ink/60 px-2 text-2xs font-medium text-white backdrop-blur-sm lite:bg-ink/75">
              <Lock size={11} aria-hidden />
              Только я
            </span>
          )}
          <span className="absolute right-2 bottom-2 rounded-full bg-surface/95 px-2 py-0.5 text-xs font-semibold text-ink shadow-card">
            {pluralize(collection.items_count, PLURALS.place)}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2.5">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-ink">
            {collection.title}
          </h3>
          {showOwner && (
            <span className="mt-auto flex min-w-0 items-center gap-1.5 text-xs text-ink-soft">
              <Avatar id={collection.owner.id} name={collection.owner.display_name} size={18} />
              <span className="truncate">{collection.owner.display_name}</span>
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
