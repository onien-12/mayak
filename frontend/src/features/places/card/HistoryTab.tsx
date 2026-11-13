import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';

import { placesApi, queryKeys, type HistoryEntry } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { HISTORY_KIND_META, STATUS_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { ErrorState, Skeleton, TrustBadge } from '@/shared/ui';

function HistoryRow({ entry, last }: { entry: HistoryEntry; last: boolean }) {
  const meta = HISTORY_KIND_META[entry.kind];
  const Icon = meta.icon;
  const statusChanged =
    entry.old_status && entry.new_status && entry.old_status !== entry.new_status;

  return (
    <li className="relative flex gap-3 pb-4">
      {!last && <span aria-hidden className="absolute top-8 bottom-0 left-4 w-px bg-line" />}
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          TONES[meta.tone].soft,
        )}
      >
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm text-ink">{entry.message}</p>
        {statusChanged && entry.old_status && entry.new_status && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-faint">{STATUS_META[entry.old_status].label}</span>
            <ArrowRight size={13} aria-hidden className="text-ink-faint" />
            <TrustBadge status={entry.new_status} />
          </p>
        )}
        <p className="mt-1 text-xs text-ink-faint">
          {formatDateTime(entry.created_at)}
          {entry.actor ? ` · ${entry.actor.display_name}` : ' · автоматически'}
        </p>
      </div>
    </li>
  );
}

/** Timeline of everything that happened to the publication, newest first. */
export function HistoryTab({ placeId }: { placeId: number }) {
  const history = useQuery({
    queryKey: queryKeys.places.history(placeId),
    queryFn: () => placesApi.history(placeId),
  });

  if (history.isPending) return <Skeleton className="h-24 rounded-card" />;
  if (history.isError)
    return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;

  return (
    <ol className="flex flex-col">
      {history.data.map((entry, index) => (
        <HistoryRow key={entry.id} entry={entry} last={index === history.data.length - 1} />
      ))}
    </ol>
  );
}
