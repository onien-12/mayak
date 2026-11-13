import { Check, Lock, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { errorMessage, type Collection, type PlaceCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { Button, ErrorState, Input, Skeleton, SPRING, Spinner } from '@/shared/ui';

import { CollectionCover } from './CollectionCover';
import { usePlaceMembership } from './usePlaceMembership';
import { useSaveCollection } from './useCollections';

function PickerRow({
  collection,
  member,
  onToggle,
}: {
  collection: Collection;
  member: boolean | undefined;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={member ?? false}
      disabled={member === undefined}
      onClick={onToggle}
      className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-canvas active:bg-canvas lg:min-h-12"
    >
      <CollectionCover
        collection={collection}
        className="size-10 shrink-0 overflow-hidden rounded-lg"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 truncate text-sm font-medium text-ink">
          <span className="truncate">{collection.title}</span>
          {!collection.is_public && (
            <Lock size={12} aria-label="Личная" className="shrink-0 text-ink-faint" />
          )}
        </span>
        <span className="block text-xs text-ink-faint">
          {pluralize(collection.items_count, PLURALS.place)}
        </span>
      </span>
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
          member ? 'border-success bg-success text-white' : 'border-line bg-surface',
        )}
      >
        {member === undefined ? (
          <Spinner size={12} />
        ) : (
          <AnimatePresence initial={false}>
            {member && (
              <motion.span
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={SPRING.pop}
                className="inline-flex"
              >
                <Check size={14} strokeWidth={3} aria-hidden />
              </motion.span>
            )}
          </AnimatePresence>
        )}
      </span>
    </button>
  );
}

function NewCollectionInline({ onCreated }: { onCreated: (collection: Collection) => void }) {
  const create = useSaveCollection();
  const [title, setTitle] = useState<string | null>(null);
  const valid = (title ?? '').trim().length >= 3;

  if (title === null) {
    return (
      <Button
        variant="ghost"
        icon={Plus}
        block
        className="justify-start"
        onClick={() => setTitle('')}
      >
        Новая подборка
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        create.mutate(
          { title: title.trim() },
          {
            onSuccess: (collection) => {
              setTitle(null);
              onCreated(collection);
            },
          },
        );
      }}
    >
      <Input
        autoFocus
        value={title}
        maxLength={80}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Название подборки"
        aria-label="Название новой подборки"
        invalid={create.isError}
      />
      {create.isError ? (
        <p role="alert" className="text-xs text-danger-ink">
          {errorMessage(create.error)}
        </p>
      ) : (
        <p className="text-xs text-ink-faint">
          Подборка будет личной — открыть её всем можно позже.
        </p>
      )}
      <div className="flex gap-2 [&>*]:flex-1">
        <Button variant="secondary" size="sm" onClick={() => setTitle(null)}>
          Отмена
        </Button>
        <Button type="submit" size="sm" disabled={!valid} loading={create.isPending}>
          Создать и добавить
        </Button>
      </div>
    </form>
  );
}

/** Content of «Добавить в подборку»: my collections with checkmarks and an inline «Новая». */
export function CollectionPicker({ place }: { place: PlaceCard }) {
  const { collections, isMember, toggle, isPending, isError, error, refetch } =
    usePlaceMembership(place);

  return (
    <div className="flex flex-col gap-1 p-1.5 lg:w-80">
      <p className="px-2 pt-1 pb-1.5 text-sm font-semibold text-ink">Добавить в подборку</p>
      {isPending ? (
        [0, 1].map((key) => <Skeleton key={key} className="mx-2 my-1 h-12 rounded-control" />)
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} className="py-4" />
      ) : (
        collections.map((collection) => (
          <PickerRow
            key={collection.id}
            collection={collection}
            member={isMember(collection.id)}
            onToggle={() => toggle(collection.id)}
          />
        ))
      )}
      <div className="mt-1 border-t border-line pt-1">
        <NewCollectionInline onCreated={(collection) => toggle(collection.id, true)} />
      </div>
    </div>
  );
}
