import { MapPinned } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Link } from 'react-router';

import { PlaceListItem } from '@/features/places';
import type { PlaceCard } from '@/shared/api';
import { buttonClasses, EmptyState, HeartButton } from '@/shared/ui';

import { RemovableItem } from './RemovableItem';
import { useUnsavePlace } from './useFavorites';

/** Favorite places; the heart removes one at once with «Вернуть» in the toast. */
export function FavoritePlacesTab({ places }: { places: readonly PlaceCard[] }) {
  const unsave = useUnsavePlace();

  if (places.length === 0) {
    return (
      <EmptyState
        icon={MapPinned}
        title="Пока ничего не сохранено"
        description="Нажмите на сердечко в карточке места — оно появится здесь и на карте."
        action={
          <Link to="/" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            Открыть карту
          </Link>
        }
      />
    );
  }

  return (
    <ul aria-label="Избранные места" className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {places.map((place, index) => (
          <RemovableItem key={place.id} index={index}>
            <PlaceListItem
              place={place}
              trailing={
                <HeartButton
                  active
                  labels={{ on: 'Убрать из избранного', off: 'В избранное' }}
                  onToggle={() => unsave.mutate(place)}
                />
              }
            />
          </RemovableItem>
        ))}
      </AnimatePresence>
    </ul>
  );
}
