import { Trophy, Users } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { pluralize } from '@/shared/lib/format';
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui';

import { formatResult, HINT_PENALTY_MIN, QUEST_PLURALS } from '../lib/meta';
import { useQuestResults } from '../useQuests';

const MEDALS = [
  'bg-beam text-ink',
  'bg-surface text-ink ring-1 ring-line',
  'bg-tourism-soft text-tourism-ink',
];

/** Top 10 by time with the hint penalty; test runs and replays are not on it. */
export function QuestResults({ questId }: { questId: number }) {
  const results = useQuestResults(questId);

  return (
    <section aria-labelledby="quest-results" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="quest-results" className="font-display text-base font-semibold text-ink">
          Лучшие результаты
        </h2>
        <span className="text-xs text-ink-soft">подсказка — +{HINT_PENALTY_MIN} мин</span>
      </div>
      {results.isPending && <Skeleton className="h-24 rounded-card" />}
      {results.isError && (
        <ErrorState error={results.error} onRetry={() => void results.refetch()} />
      )}
      {results.data?.length === 0 && (
        <EmptyState
          icon={Trophy}
          title="Пока никто не дошёл до конца"
          description="Пройдите первым — ваш результат окажется на вершине."
          className="py-4"
        />
      )}
      {results.data && results.data.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {results.data.map((row) => (
            <li
              key={`${row.rank}-${row.finished_at}`}
              className={cn(
                'flex items-center gap-3 rounded-control px-3 py-2',
                row.is_mine ? 'bg-beam-soft ring-1 ring-beam' : 'bg-canvas',
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                  MEDALS[row.rank - 1] ?? 'bg-surface text-ink-soft',
                )}
              >
                {row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {row.name}
                  {row.is_mine && <span className="font-normal text-ink-soft"> · вы</span>}
                </span>
                <span className="flex items-center gap-1 text-xs text-ink-soft">
                  {row.is_team && (
                    <>
                      <Users size={12} aria-hidden />
                      {pluralize(row.members_count, QUEST_PLURALS.player)}
                      {row.hints > 0 && ' · '}
                    </>
                  )}
                  {row.hints > 0 && pluralize(row.hints, QUEST_PLURALS.hint)}
                  {!row.is_team && row.hints === 0 && 'без подсказок'}
                </span>
              </span>
              <span className="font-display text-base font-semibold text-ink tabular-nums">
                {formatResult(row.result_s)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
