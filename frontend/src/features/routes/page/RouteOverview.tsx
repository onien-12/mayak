import { Backpack, Spline } from 'lucide-react';
import { useState } from 'react';

import type { RouteDetail } from '@/shared/api';
import { formatDate, pluralize } from '@/shared/lib/format';
import { PATH_MODE_META } from '@/shared/lib/labels';
import { Chip, Lightbox, Rise, UserChip, type ViewerPhoto } from '@/shared/ui';

import { ROUTE_PLURALS } from '../lib/plurals';
import type { NumberedStop } from '../lib/stops';
import { RouteKindBadges, RouteStateBadge } from '../ui/RouteBadges';
import { RouteStats } from '../ui/RouteStats';
import { RouteActionTiles } from './RouteActions';
import { RouteReviews } from './RouteReviews';
import { RouteStateBanner } from './RouteStateBanner';
import { StopsTimeline } from './StopsTimeline';

interface RouteOverviewProps {
  route: RouteDetail;
  stops: readonly NumberedStop[];
  activePosition: number | null;
  onSelectStop: (position: number) => void;
  scrollSignal: number;
}

/** The cover opens the viewer over every stop photo, starting at the cover itself. */
function RouteCover({ route, coverUrl }: { route: RouteDetail; coverUrl: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const stopPhotos: ViewerPhoto[] = route.stops.flatMap((stop) =>
    stop.photos.map((photo) => ({ ...photo, caption: stop.title })),
  );
  const photos = stopPhotos.some((photo) => photo.url === coverUrl)
    ? stopPhotos
    : [{ url: coverUrl }, ...stopPhotos];
  const start = photos.findIndex((photo) => photo.url === coverUrl);

  return (
    <>
      <button
        type="button"
        onClick={() => setIndex(start)}
        aria-label={`Открыть фото маршрута: ${photos.length}`}
        className="block h-32 w-full overflow-hidden rounded-card bg-canvas transition-transform duration-150 active:scale-[0.98] lg:h-48"
      >
        <img src={coverUrl} alt="" className="size-full object-cover" />
      </button>
      <Lightbox photos={photos} index={index} onIndexChange={setIndex} alt={route.title} />
    </>
  );
}

/** Everything about the route under the header: facts, actions, story, stops, reviews. */
export function RouteOverview({
  route,
  stops,
  activePosition,
  onSelectStop,
  scrollSignal,
}: RouteOverviewProps) {
  const reviewable =
    route.visibility === 'public' &&
    (route.status === 'published' || route.status === 'needs_review');

  return (
    <div className="flex flex-col gap-5">
      <Rise className="flex flex-col gap-4">
        {route.cover_url && <RouteCover route={route} coverUrl={route.cover_url} />}
        <div className="flex flex-wrap items-center gap-1.5">
          <RouteKindBadges route={route} size="md" />
          <RouteStateBadge route={route} size="md" />
        </div>
        <UserChip
          user={route.author}
          caption={`Автор маршрута · ${formatDate(route.created_at)}`}
        />
        <RouteStats route={route} />
        <RouteActionTiles route={route} />
      </Rise>

      <RouteStateBanner route={route} />

      {(route.description || route.tags.length > 0) && (
        <section className="flex flex-col gap-3">
          {route.description && (
            <p className="text-base whitespace-pre-line text-ink">{route.description}</p>
          )}
          {route.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {route.tags.map((tag) => (
                <Chip key={tag}>#{tag}</Chip>
              ))}
            </div>
          )}
        </section>
      )}

      {route.tips && (
        <section className="flex gap-3 rounded-card bg-success-soft p-4">
          <Backpack size={20} aria-hidden className="mt-0.5 shrink-0 text-success-ink" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-success-ink">Что взять и когда идти</h2>
            <p className="mt-1 text-sm whitespace-pre-line text-ink">{route.tips}</p>
          </div>
        </section>
      )}

      <section aria-labelledby="route-stops" className="flex flex-col gap-3">
        <div>
          <h2 id="route-stops" className="font-display text-base font-semibold text-ink">
            {pluralize(stops.length, ROUTE_PLURALS.point)} маршрута
          </h2>
          {route.path_mode === 'direct' && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-faint">
              <Spline size={13} aria-hidden />
              {PATH_MODE_META.direct.description}
            </p>
          )}
        </div>
        <StopsTimeline
          stops={stops}
          activePosition={activePosition}
          onSelect={onSelectStop}
          scrollSignal={scrollSignal}
        />
      </section>

      {reviewable && <RouteReviews route={route} />}
    </div>
  );
}
