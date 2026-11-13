import { useQuery } from '@tanstack/react-query';

import { queryKeys, statsApi } from '@/shared/api';
import { ErrorState, PageLayout, Skeleton } from '@/shared/ui';

import { ActivityChart } from './ActivityChart';
import { DataSources } from './DataSources';
import { HeroTotals } from './HeroTotals';
import { IssuesFunnel } from './IssuesFunnel';
import { LayerDonut } from './LayerDonut';
import { Leaderboard } from './Leaderboard';
import { TopCategories } from './TopCategories';
import { TrustBreakdown } from './TrustBreakdown';

const STATS_STALE_MS = 5 * 60_000;

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Загрузка">
      <Skeleton className="h-44 rounded-panel" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-panel" />
    </div>
  );
}

/**
 * «Пульс города» (`/stats`, public): what residents did (totals), where the rest of the data
 * comes from, how trustworthy the map is, how issues get solved, 30-day activity, popular
 * categories and the people behind it.
 */
export default function StatsPage() {
  const stats = useQuery({
    queryKey: queryKeys.stats,
    queryFn: statsApi.get,
    staleTime: STATS_STALE_MS,
  });

  return (
    <PageLayout title="Пульс города" subtitle="Владивосток на карте жителей">
      {stats.isPending && <StatsSkeleton />}
      {stats.isError && <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />}
      {stats.data && (
        <div className="flex flex-col gap-4 lg:gap-5">
          <HeroTotals totals={stats.data.totals} />
          <DataSources stats={stats.data} />
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            <ActivityChart activity={stats.data.activity} />
            <TrustBreakdown breakdown={stats.data.status_breakdown} />
            <LayerDonut byLayer={stats.data.by_layer} />
            <IssuesFunnel byStage={stats.data.issues_by_stage} />
            <TopCategories categories={stats.data.top_categories} />
            <Leaderboard users={stats.data.top_contributors} />
          </div>
        </div>
      )}
    </PageLayout>
  );
}
