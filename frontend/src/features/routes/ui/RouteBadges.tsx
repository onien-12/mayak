import { Lock } from 'lucide-react';

import type { RouteCard } from '@/shared/api';
import { ROUTE_DIFFICULTY_META, ROUTE_KIND_META, ROUTE_STATUS_META } from '@/shared/lib/labels';
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
