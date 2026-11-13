import { ChevronRight, ScrollText } from 'lucide-react';
import { Link } from 'react-router';

import type { ModerationLogEntry } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { MODERATION_ACTION_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Button, EmptyState, ErrorState, ListSkeleton, StaggerItem, UserChip } from '@/shared/ui';

import { useModerationLog } from './useModeration';

function LogRow({ entry }: { entry: ModerationLogEntry }) {
  const action = MODERATION_ACTION_META[entry.action];
  const Icon = action.icon;
  return (
    <article className="flex gap-3 rounded-card border border-line/70 bg-surface p-3">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          TONES[action.tone].soft,
        )}
      >
        <Icon size={18} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className={cn('font-semibold', TONES[action.tone].text)}>{action.done}</span>
          <span className="text-ink-faint">{formatDateTime(entry.created_at)}</span>
        </p>
        <Link
          to={`/moderation/${entry.case_id}`}
          className="flex items-center gap-1 text-base leading-tight font-semibold text-ink hover:underline"
        >
          <span className="line-clamp-2">{entry.target_title}</span>
          <ChevronRight size={15} aria-hidden className="shrink-0 text-ink-faint" />
        </Link>
        <p className="rounded-control bg-canvas px-3 py-2 text-sm text-ink">«{entry.reason}»</p>
        <UserChip user={entry.moderator} size="sm" caption="модератор" />
      </div>
    </article>
  );
}

/** «Журнал»: the immutable log of every decision, newest first. */
export function ModerationLog() {
  const log = useModerationLog();
  const entries = log.data?.pages.flat() ?? [];

  if (log.isPending) return <ListSkeleton rows={4} />;
  if (log.isError) return <ErrorState error={log.error} onRetry={() => void log.refetch()} />;
  if (entries.length === 0) {
    return <EmptyState icon={ScrollText} title="Журнал пуст" description="Решений ещё не было." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Журнал нельзя изменить: каждое решение остаётся здесь с причиной и автором.
      </p>
      <ul className="flex flex-col gap-2">
        {entries.map((entry, index) => (
          <StaggerItem key={entry.id} index={index}>
            <LogRow entry={entry} />
          </StaggerItem>
        ))}
      </ul>
      {log.hasNextPage && (
        <Button
          variant="secondary"
          loading={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          Показать ещё
        </Button>
      )}
    </div>
  );
}
