import { useRecommendations } from '@/features/interests';

import { useEventsFilters } from './filtersStore';
import { periodBounds } from './period';

/** «Для вас» of the afisha (SPEC §23.5) within the chosen period; nothing while `hidden`. */
export function useEventRecommendations(hidden: boolean) {
  const time = useEventsFilters((state) => state.time);
  const range = useEventsFilters((state) => state.range);
  const query = useRecommendations(
    { scope: 'events', ...periodBounds({ time, range }) },
    { enabled: !hidden },
  );
  return hidden ? undefined : query.data;
}
