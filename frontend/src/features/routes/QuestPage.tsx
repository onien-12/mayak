import { MapPinOff } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useMapActions } from '@/features/map';
import { formatDuration, pluralize } from '@/shared/lib/format';
import { buttonClasses, EmptyState, ErrorState, PanelLayout, Skeleton } from '@/shared/ui';

import { QUEST_PLURALS } from './quests/lib/meta';
import { QuestMenu } from './quests/page/QuestMenu';
import { QuestOverview } from './quests/page/QuestOverview';
import { QuestStartActions } from './quests/page/QuestStartActions';
import { StartMarker } from './quests/QuestMarkers';
import { isNotFound, parseId, useQuest } from './quests/useQuests';

const BACK = '/routes?view=quests';

/** `/quests/:id` — a quest's public card: story, start on the map, results, reviews, play. */
export default function QuestPage() {
  const navigate = useNavigate();
  const id = parseId(useParams().id);
  const quest = useQuest(id);
  const { flyTo, ready } = useMapActions();
  const start = quest.data?.start;

  useEffect(() => {
    if (ready && start) flyTo(start, { minZoom: 15 });
  }, [ready, start, flyTo]);

  if (quest.data) {
    const data = quest.data;
    return (
      <>
        <StartMarker position={data.start} label={`Старт: ${data.start.title}`} active />
        <PanelLayout
          title={data.title}
          subtitle={`Квест · ${pluralize(data.stages_count, QUEST_PLURALS.stage)} · ~${formatDuration(data.duration_min)}`}
          onBack={() => navigate(BACK)}
          backLabel="К квестам"
          actions={<QuestMenu quest={data} />}
          footer={<QuestStartActions quest={data} />}
        >
          <QuestOverview quest={data} />
        </PanelLayout>
      </>
    );
  }

  const missing = Number.isNaN(id) || isNotFound(quest.error);
  return (
    <PanelLayout title="Квест" onBack={() => navigate(BACK)} backLabel="К квестам">
      {missing ? (
        <EmptyState
          icon={MapPinOff}
          title="Квест не найден"
          description="Возможно, его удалили, это чей-то черновик или он ещё на проверке."
          action={
            <Link to={BACK} className={buttonClasses({ variant: 'secondary' })}>
              Все квесты
            </Link>
          }
        />
      ) : quest.isError ? (
        <ErrorState error={quest.error} onRetry={() => void quest.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 rounded-card" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-16 rounded-control" />
            ))}
          </div>
          <Skeleton className="h-24 rounded-card" />
        </div>
      )}
    </PanelLayout>
  );
}
