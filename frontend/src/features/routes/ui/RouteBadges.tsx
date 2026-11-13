import { Lock } from 'lucide-react';

import type { RouteCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { ROUTE_DIFFICULTY_META, ROUTE_KIND_META, ROUTE_STATUS_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Badge } from '@/shared/ui';

type BadgeRoute = Pick<RouteCard, 'kind' | 'difficulty' | 'status' | 'visibility'>;

/** Kind and difficulty. */
export function RouteKindBadges({ route, size }: { route: BadgeRoute; size?: 'sm' | 'md' }) {
  const kind = ROUTE_KIND_META[route.kind];
  const difficulty = route.difficulty ? ROUTE_DIFFICULTY_META[route.difficulty] : null;
  return (
    <>
      <Badge tone={kind.tone} icon={kind.icon} size={size}>
        {kind.label}
      </Badge>
      {difficulty && (
        <Badge
          tone={difficulty.tone}
          icon={difficulty.icon}
          size={size}
          title={difficulty.description}
        >
          {difficulty.label}
        </Badge>
      )}
    </>
  );
}

/** Compact one-line «🚲 На велосипеде · Средний» for list cards. */
export function RouteKindLine({ route }: { route: BadgeRoute }) {
  const kind = ROUTE_KIND_META[route.kind];
  const difficulty = route.difficulty ? ROUTE_DIFFICULTY_META[route.difficulty] : null;
  return (
    <p className="flex min-w-0 items-center gap-1 text-xs font-medium">
      <kind.icon size={13} aria-hidden className={cn('shrink-0', TONES[kind.tone].text)} />
      <span className={cn('truncate', TONES[kind.tone].text)}>{kind.label}</span>
      {difficulty && (
        <>
          <span aria-hidden className="text-ink-faint">
            ·
          </span>
          <span className={cn('shrink-0', TONES[difficulty.tone].text)}>{difficulty.label}</span>
        </>
      )}
    </p>
  );
}

/** What only the author sees: «Только для меня», «На проверке», «Скрыт»… */
export function RouteStateBadge({ route, size }: { route: BadgeRoute; size?: 'sm' | 'md' }) {
  if (route.visibility === 'private') {
    return (
      <Badge tone="neutral" icon={Lock} size={size}>
        Только для меня
      </Badge>
    );
  }
  if (route.status === 'published') return null;
  const status = ROUTE_STATUS_META[route.status];
  return (
    <Badge tone={status.tone} icon={status.icon} size={size}>
      {status.label}
    </Badge>
  );
}
