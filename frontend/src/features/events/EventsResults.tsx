import { Button, ErrorState, ListSkeleton } from '@/shared/ui';

import { EventsEmpty } from './EventsEmpty';
import { EventsList } from './EventsList';
import { useEventsFilters } from './filtersStore';
import { ForYouEvents } from './ForYouEvents';
import { MyEventsLink } from './MyEventsLink';
import type { EventsFeed } from './useEventsFeed';
import { useEventRecommendations } from './useEventRecommendations';
import { useMarkerHighlight } from './useMarkerHighlight';

/**
 * Body of the afisha: a quiet link to «Мои события», «Для вас», the day-grouped list (what is
 * going on now leads today's group) and paging, with loading, empty and error states.
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

  if (feed.isLoading) return <ListSkeleton rows={5} />;
  if (feed.isError || !events) {
    return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  }

  return (
    <div ref={listRef} className="flex flex-col gap-3">
      {!past && <MyEventsLink />}
      {!invites && forYou}
      {events.length === 0 ? (
        <EventsEmpty activeSearch={feed.activeSearch} />
      ) : (
        events.length > 0 && (
          <EventsList
            events={events}
            grouped={sort === 'start'}
            distanceOrigin={feed.distanceOrigin}
            distanceOnly={radiusKm !== null}
            highlightId={highlightId}
            afterFirstGroup={invites ? forYou : undefined}
          />
        )
      )}
      {invites && events.length === 0 && forYou}
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
