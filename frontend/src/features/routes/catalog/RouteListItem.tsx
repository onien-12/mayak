import { Map as MapIcon } from 'lucide-react';

import type { RouteCard } from '@/shared/api';
import { formatDistance, formatDuration } from '@/shared/lib/format';
import { ROUTE_DIFFICULTY_META, ROUTE_KIND_META } from '@/shared/lib/labels';
import { IconButton, ListCard, ListMark, ListRating } from '@/shared/ui';

import { PathSketch } from '../ui/PathSketch';
import { RouteStateBadge } from '../ui/RouteBadges';

interface RouteListItemProps {
  route: RouteCard;
  /** The card whose line is previewed on the map. */
  highlighted?: boolean;
  /** Shows the line on the map (hover / focus on desktop, the map button on phones). */
  onPreview?: (route: RouteCard | null) => void;
  /** Own routes: visibility and moderation state. */
  showState?: boolean;
}

/**
 * Route card: cover or a sketch of the line, name, «how · how hard», length and time, rating.
 * Stops, author and saves are on the route page.
 */
export function RouteListItem({
  route,
  highlighted = false,
  onPreview,
  showState = false,
}: RouteListItemProps) {
  const kind = ROUTE_KIND_META[route.kind];
  const difficulty = route.difficulty ? ROUTE_DIFFICULTY_META[route.difficulty] : null;
  const ownState = showState && (route.visibility === 'private' || route.status !== 'published');

  return (
    <ListCard
      onPointerEnter={(event) => event.pointerType === 'mouse' && onPreview?.(route)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && onPreview?.(null)}
      // Keyboard focus only: a tap focuses the link too, and previewing then (the phone sheet
      // gives way to the map) would pull the card from under the finger before the click lands.
      onFocus={(event) => event.target.matches(':focus-visible') && onPreview?.(route)}
      media={
        route.cover_url ? (
          <img src={route.cover_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <PathSketch path={route.path} kind={route.kind} className="size-full" />
        )
      }
      title={route.title}
      to={`/routes/${route.id}`}
      meta={difficulty ? `${kind.label} · ${difficulty.label.toLowerCase()}` : kind.label}
      marks={
        <>
          <ListMark strong>
            {formatDistance(route.distance_m)} · {formatDuration(route.duration_min)}
          </ListMark>
          <ListRating item={route} ownLabel="Оценка маршрута" />
        </>
      }
      action={
        onPreview && (
          <IconButton
            icon={MapIcon}
            label="Показать на карте"
            size="sm"
            active={highlighted}
            onClick={() => onPreview(route)}
          />
        )
      }
      footer={ownState && <RouteStateBadge route={route} />}
      highlight={highlighted && 'brand'}
    />
  );
}
