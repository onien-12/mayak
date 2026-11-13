import { requireAuth } from '@/features/auth';
import { openCreatePlace } from '@/features/places';

/** Opens the create wizard on the event layer — a city event or a small meetup. */
export function startCreateEvent(isMeetup: boolean): void {
  requireAuth(
    () => openCreatePlace({ layer: 'event', isMeetup }),
    isMeetup ? 'чтобы собрать встречу' : 'чтобы добавить событие',
  );
}
