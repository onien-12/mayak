import { Heart, Map as MapIcon, Star } from 'lucide-react';
import { Link } from 'react-router';

import type { RouteCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDistance, formatDuration, formatNumber, pluralize } from '@/shared/lib/format';
import { Avatar, IconButton } from '@/shared/ui';

import { ROUTE_PLURALS } from '../lib/plurals';
import { PathSketch } from '../ui/PathSketch';
import { RouteKindLine, RouteStateBadge } from '../ui/RouteBadges';

interface RouteListItemProps {
  route: RouteCard;
  /** The card whose line is previewed on the map. */
  highlighted?: boolean;
  /** Shows the line on the map (hover / focus on desktop, the map button on phones). */
  onPreview?: (route: RouteCard | null) => void;
  /** Own routes: visibility and moderation state. */
  showState?: boolean;
}

/** Route card: cover or a sketch of the line, badges, distance, time, stops, rating, author. */
export function RouteListItem({
  route,
  highlighted = false,
  onPreview,
  showState = false,
}: RouteListItemProps) {
  const facts = [
    formatDistance(route.distance_m),
    formatDuration(route.duration_min),
    pluralize(route.stops_count, ROUTE_PLURALS.point),
  ];

  return (
    <article
      onPointerEnter={(event) => event.pointerType === 'mouse' && onPreview?.(route)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && onPreview?.(null)}
      // Keyboard focus only: a tap focuses the link too, and previewing then (the phone sheet
      // gives way to the map) would pull the card from under the finger before the click lands.
      onFocus={(event) => event.target.matches(':focus-visible') && onPreview?.(route)}
      className={cn(
        'group relative flex gap-3 rounded-card border bg-surface p-2.5 transition-[border-color,box-shadow,scale] duration-150 has-[h3>a:active]:scale-[0.98]',
        highlighted
          ? 'border-brand shadow-card'
          : 'border-line/70 hover:border-ink-faint/50 hover:shadow-card',
      )}
    >
      <div className="relative size-[92px] shrink-0 overflow-hidden rounded-control bg-canvas">
        {route.cover_url ? (
          <img src={route.cover_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <PathSketch path={route.path} kind={route.kind} className="size-full" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <RouteKindLine route={route} />
        <h3 className="line-clamp-2 text-base leading-tight font-semibold text-ink">
          <Link
            to={`/routes/${route.id}`}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
          >
            {route.title}
          </Link>
        </h3>
        <p className="flex flex-wrap gap-x-1.5 text-sm text-ink-soft tabular-nums">
          {facts.map((fact, index) => (
            <span key={fact} className="whitespace-nowrap">
              {index > 0 && (
                <span aria-hidden className="mr-1.5 text-ink-faint">
                  ·
                </span>
              )}
              {fact}
            </span>
          ))}
        </p>
        {showState && (
          <div className="flex">
            <RouteStateBadge route={route} />
          </div>
        )}
        <div className="mt-auto flex items-center gap-3 pt-0.5 text-xs text-ink-soft">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar id={route.author.id} name={route.author.display_name} size={20} />
            <span className="truncate">{route.author.display_name}</span>
          </span>
          {route.rating_avg !== null && route.rating_count > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 font-semibold text-ink">
              <Star size={12} aria-hidden className="fill-beam text-beam" />
              {route.rating_avg.toFixed(1).replace('.', ',')}
            </span>
          )}
          {route.saves_count > 0 && (
            <span className="flex shrink-0 items-center gap-0.5" title="Сохранили себе">
              <Heart
                size={12}
                aria-hidden
                className={cn(route.is_saved ? 'fill-danger text-danger' : 'text-ink-faint')}
              />
              {formatNumber(route.saves_count)}
            </span>
          )}
        </div>
      </div>
      {onPreview && (
        <div className="relative z-10 -mr-1 flex shrink-0 flex-col justify-end">
          <IconButton
            icon={MapIcon}
            label="Показать на карте"
            active={highlighted}
            onClick={() => onPreview(route)}
          />
        </div>
      )}
    </article>
  );
}
