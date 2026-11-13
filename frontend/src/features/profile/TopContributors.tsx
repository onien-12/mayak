import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronRight, Trophy } from 'lucide-react';
import { Link } from 'react-router';

import { queryKeys, usersApi } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber } from '@/shared/lib/format';
import { Skeleton, StaggerItem, UserChip } from '@/shared/ui';

const TOP = 5;
const PODIUM = ['bg-beam text-ink', 'bg-line text-ink', 'bg-tourism-soft text-tourism-ink'];

/** Mini leaderboard «Лучшие жители» with a link to the city statistics. */
export function TopContributors({ highlightId }: { highlightId: number }) {
  const top = useQuery({ queryKey: queryKeys.users.top(TOP), queryFn: () => usersApi.top(TOP) });

  if (top.isError || top.data?.length === 0) return null;

  return (
    <section
      aria-labelledby="top-contributors"
      className="rounded-panel border border-line/70 bg-surface p-5 shadow-card"
    >
      <h2
        id="top-contributors"
        className="flex items-center gap-2 font-display text-base font-semibold text-ink"
      >
        <Trophy size={18} aria-hidden className="text-warning" />
        Лучшие жители
      </h2>
      {top.isPending ? (
        <Skeleton className="mt-4 h-40 rounded-card" />
      ) : (
        <ol className="mt-3 flex flex-col">
          {top.data.map((user, index) => (
            <StaggerItem
              key={user.id}
              index={index}
              className={cn(
                '-mx-2 flex items-center gap-3 rounded-control px-2 py-2',
                user.id === highlightId && 'bg-brand-soft/70',
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  PODIUM[index] ?? 'bg-canvas text-ink-soft',
                )}
              >
                {index + 1}
              </span>
              <UserChip user={user} size="sm" className="flex-1" />
              <span className="shrink-0 font-display text-sm font-semibold text-ink tabular-nums">
                {formatNumber(user.reputation)}
              </span>
            </StaggerItem>
          ))}
        </ol>
      )}
      <Link
        to="/stats"
        className="mt-3 flex min-h-11 items-center gap-2 rounded-control bg-canvas px-3.5 py-3 text-sm font-semibold text-ink transition-transform active:scale-[0.99]"
      >
        <BarChart3 size={17} aria-hidden className="text-brand" />
        <span className="flex-1">Пульс города и вся статистика</span>
        <ChevronRight size={17} aria-hidden className="text-ink-faint" />
      </Link>
    </section>
  );
}
