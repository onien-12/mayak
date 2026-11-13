import { useMemo } from 'react';

import { Button, ErrorState, ListSkeleton } from '@/shared/ui';

import { EventsEmpty } from './EventsEmpty';
import { EventsList } from './EventsList';
import { useEventsFilters } from './filtersStore';
import { ForYouEvents } from './ForYouEvents';
import { MyEvents } from './MyEvents';
import { OngoingStrip } from './OngoingStrip';
import type { EventsFeed } from './useEventsFeed';
import { useMarkerHighlight } from './useMarkerHighlight';

/**
 * Body of the afisha: «Для вас», «Идёт сейчас», «Мои события», the day-grouped list and
 * paging, with loading, empty and error states.
 */
export function EventsResults({ feed }: { feed: EventsFeed }) {
  const sort = useEventsFilters((state) => state.sort);
  const past = useEventsFilters((state) => state.past);
  const radiusKm = useEventsFilters((state) => state.radiusKm);
  const { events } = feed;
  const { listRef, highlightId } = useMarkerHighlight(events);

  const [ongoing, upcoming] = useMemo(() => {
    if (!events || past) return [[], events ?? []];
    return [
      events.filter((place) => place.event?.phase === 'ongoing'),
      events.filter((place) => place.event?.phase !== 'ongoing'),
    ];
  }, [events, past]);

  if (feed.isLoading) return <ListSkeleton rows={5} />;
  if (feed.isError || !events) {
    return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  }

  return (
    <div ref={listRef} className="flex flex-col gap-3">
      <ForYouEvents events={events} hidden={past || feed.activeSearch !== ''} />
      <OngoingStrip events={ongoing} />
      {!past && <MyEvents />}
      {events.length === 0 ? (
        <EventsEmpty activeSearch={feed.activeSearch} />
      ) : (
        upcoming.length > 0 && (
          <EventsList
            events={upcoming}
            grouped={sort === 'start'}
            distanceOrigin={feed.distanceOrigin}
            distanceOnly={radiusKm !== null}
            highlightId={highlightId}
          />
        )
      )}
      {feed.hasMore && (
        <Button
          variant="secondary"
          block
          loading={feed.isLoadingMore}
          onClick={() => void feed.loadMore()}
        >
          Показать ещё
        </Button>
      )}
    </div>
  );
}
