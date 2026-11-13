import { MapPinOff } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';

import { RequireAuth, useAuth } from '@/features/auth';
import { buttonClasses, EmptyState, ErrorState, PanelLayout, Skeleton } from '@/shared/ui';

import { RunView } from './quests/play/RunView';
import { isNotFound, parseId, useQuestRun } from './quests/useQuests';

const BACK = '/routes?view=quests';

/** `/quests/play/:runId` — playing a quest, solo or in a team (signed-in players only). */
export default function QuestRunPage() {
  const navigate = useNavigate();
  const runId = parseId(useParams().runId);
  const { user, isAuthenticated } = useAuth();
  const run = useQuestRun(isAuthenticated ? runId : NaN);

  if (run.data && user) return <RunView key={run.data.id} run={run.data} viewerId={user.id} />;

  return (
    <PanelLayout title="Квест" onBack={() => navigate(BACK)} backLabel="К квестам">
      {!isAuthenticated ? (
        <RequireAuth reason="чтобы играть в квест">{null}</RequireAuth>
      ) : Number.isNaN(runId) || isNotFound(run.error) ? (
        <EmptyState
          icon={MapPinOff}
          title="Прохождение не найдено"
          description="Возможно, вы вышли из команды или оно завершено."
          action={
            <Link to={BACK} className={buttonClasses({ variant: 'secondary' })}>
              Все квесты
            </Link>
          }
        />
      ) : run.isError ? (
        <ErrorState error={run.error} onRetry={() => void run.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 rounded-card" />
          <Skeleton className="h-16 rounded-control" />
        </div>
      )}
    </PanelLayout>
  );
}
