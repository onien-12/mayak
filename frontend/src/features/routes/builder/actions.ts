import type { PlaceCard } from '@/shared/api';
import { toast } from '@/shared/ui';

import { isVia, MAX_STOPS } from './model';
import { useBuilderStore } from './store';

export const FULL_ROUTE_MESSAGE = `В маршруте может быть до ${MAX_STOPS} точек`;

/** Adds a stop linked to a map place (title and position from the place). */
export function addPlaceStop(place: PlaceCard): void {
  const id = useBuilderStore.getState().addStop(place, {
    title: place.title,
    place: { id: place.id, title: place.title, layer: place.layer },
  });
  if (id === null) toast.info(FULL_ROUTE_MESSAGE);
}

/** Undo-able removal of a stop or a shaping point. */
export function removeWithUndo(id: string): void {
  const store = useBuilderStore.getState();
  const removed = store.removeStop(id);
  if (!removed) return;
  toast.info(isVia(removed.stop) ? 'Промежуточная точка удалена' : 'Точка удалена', {
    label: 'Вернуть',
    onClick: () => useBuilderStore.getState().restoreStop(removed.stop, removed.index),
  });
}
