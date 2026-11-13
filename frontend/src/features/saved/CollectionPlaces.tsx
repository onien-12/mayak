import { MapPinPlus, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Link } from 'react-router';

import { PlaceListItem } from '@/features/places';
import type { CollectionDetail, PlaceCard } from '@/shared/api';
import { buttonClasses, EmptyState, IconButton } from '@/shared/ui';

import { RemovableItem } from './RemovableItem';
import { useRemoveFromCollection } from './useCollections';

/** Places of a collection; the owner can take a place out (with «Вернуть»). */
export function CollectionPlaces({ collection }: { collection: CollectionDetail }) {
  const removeFromCollection = useRemoveFromCollection();
  const remove = (place: PlaceCard) => removeFromCollection(collection.id, place);

  if (collection.places.length === 0) {
    return (
      <EmptyState
        icon={MapPinPlus}
        title="В подборке пока нет мест"
        description={
          collection.can_edit
            ? 'Откройте место на карте и нажмите «Добавить в подборку».'
            : 'Автор ещё не добавил сюда места.'
        }
        action={
          collection.can_edit && (
            <Link to="/" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              Открыть карту
            </Link>
          )
        }
      />
    );
  }

  return (
    <ul aria-label="Места подборки" className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {collection.places.map((place, index) => (
          <RemovableItem key={place.id} index={index}>
            <PlaceListItem
              place={place}
              trailing={
                collection.can_edit && (
                  <IconButton icon={X} label="Убрать из подборки" onClick={() => remove(place)} />
                )
              }
            />
          </RemovableItem>
        ))}
      </AnimatePresence>
    </ul>
  );
}
