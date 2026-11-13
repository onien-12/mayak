import { useMemo } from 'react';

import { Button, ErrorState, ListSkeleton } from '@/shared/ui';

import { EventsEmpty } from './EventsEmpty';
import { EventsList } from './EventsList';
import { useEventsFilters } from './filtersStore';
import { ForYouEvents } from './ForYouEvents';
import { MyEvents } from './MyEvents';
import { OngoingStrip } from './OngoingStrip';
import type { EventsFeed } from './useEventsFeed';
import { useEventRecommendations } from './useEventRecommendations';
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
  const recommendations = useEventRecommendations(past || feed.activeSearch !== '');
  const forYou = <ForYouEvents events={events} recommendations={recommendations} />;
  // Recommendations lead; the invite to choose interests waits after the first day, so the
  // half-open sheet on a phone still shows events, not a banner.
  const invites = recommendations?.personalized === false;

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
      {!invites && forYou}
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
            afterFirstGroup={invites ? forYou : undefined}
          />
        )
      )}
      {invites && upcoming.length === 0 && forYou}
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
