import { useQuery } from '@tanstack/react-query';
import { ChevronRight, History } from 'lucide-react';
import { Link } from 'react-router';

import { queryKeys, usersApi, type ReputationEvent } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import { EmptyState, ErrorState, Skeleton, StaggerItem } from '@/shared/ui';

function Delta({ delta }: { delta: number }) {
  const positive = delta > 0;
  return (
    <span
      className={cn(
        'relative z-10 flex h-8 min-w-12 shrink-0 items-center justify-center rounded-full px-2 font-display text-sm font-bold tabular-nums ring-4 ring-surface',
        positive ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink',
      )}
    >
      {positive ? `+${delta}` : `−${Math.abs(delta)}`}
    </span>
  );
}

function EventRow({ event }: { event: ReputationEvent }) {
  return (
    <div className="flex items-start gap-3">
      <Delta delta={event.delta} />
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-base text-ink">{event.message}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-soft">
          {formatRelative(event.created_at)}
          {event.place_id !== null && (
            <Link
              to={`/?place=${event.place_id}`}
              className="tap-target relative inline-flex items-center font-medium text-brand hover:underline"
            >
              Открыть место
              <ChevronRight size={14} aria-hidden />
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

/** «История репутации»: every change with its reason, newest first, as a timeline. */
export function ReputationTab() {
  const history = useQuery({
    queryKey: queryKeys.me.reputation,
    queryFn: () => usersApi.reputation(),
  });

  if (history.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Загрузка">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-10 rounded-control" />
        ))}
      </div>
    );
  }
  if (history.isError)
    return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  if (history.data.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Пока без изменений"
        description="Проверьте место рядом с вами — за каждое подтверждение начисляется +2."
      />
    );
  }

  return (
    <ol className="relative flex flex-col gap-5 before:absolute before:top-4 before:bottom-4 before:left-6 before:w-px before:bg-line">
      {history.data.map((event, index) => (
        <StaggerItem key={event.id} index={index}>
          <EventRow event={event} />
        </StaggerItem>
      ))}
    </ol>
  );
}
