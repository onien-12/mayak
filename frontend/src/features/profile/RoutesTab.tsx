import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Route } from 'lucide-react';
import { Link } from 'react-router';

import { queryKeys, usersApi, type RouteCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDistance, formatDuration, pluralize, PLURALS } from '@/shared/lib/format';
import { ROUTE_KIND_META, ROUTE_STATUS_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Badge, EmptyState, ErrorState, ListSkeleton, StaggerItem } from '@/shared/ui';

function RouteRow({ route }: { route: RouteCard }) {
  const kind = ROUTE_KIND_META[route.kind];
  const Icon = kind.icon;
  const status = ROUTE_STATUS_META[route.status];
  return (
    <Link
      to={`/routes/${route.id}`}
      className="flex items-center gap-3 rounded-card border border-line/70 bg-surface p-3 transition-[border-color,box-shadow,transform] hover:border-ink-faint/50 hover:shadow-card active:scale-[0.98]"
    >
      <span
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-control',
          TONES[kind.tone].soft,
        )}
      >
        <Icon size={22} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-base leading-tight font-semibold text-ink">
          {route.title}
        </span>
        <span className="mt-1 block truncate text-sm text-ink-soft">
          {[
            kind.label,
            formatDistance(route.distance_m),
            formatDuration(route.duration_min),
            pluralize(route.stops_count, PLURALS.stop),
          ].join(' · ')}
        </span>
        {route.status !== 'published' && (
          <Badge tone={status.tone} icon={status.icon} className="mt-1.5">
            {status.label}
          </Badge>
        )}
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-faint" />
    </Link>
  );
}

/** Author routes → `/routes/:id`. */
export function RoutesTab({ userId }: { userId: number }) {
  const routes = useQuery({
    queryKey: queryKeys.users.routes(userId),
    queryFn: () => usersApi.routes(userId),
  });

  if (routes.isPending) return <ListSkeleton rows={2} />;
  if (routes.isError)
    return <ErrorState error={routes.error} onRetry={() => void routes.refetch()} />;
  if (routes.data.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Маршрутов пока нет"
        description="Авторские прогулки и походы появятся здесь."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {routes.data.map((route, index) => (
        <StaggerItem key={route.id} index={index}>
          <RouteRow route={route} />
        </StaggerItem>
      ))}
    </ul>
  );
}
