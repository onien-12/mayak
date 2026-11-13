import { Lock, MapPinOff } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import { RequireAuth, useAuth } from '@/features/auth';
import { ApiError, type QuestEditor } from '@/shared/api';
import { EmptyState, ErrorState, PanelLayout, Skeleton } from '@/shared/ui';

import { EditorSession } from './quests/editor/EditorSession';
import { draftFromQuest, emptyDraft } from './quests/editor/model';
import { isNotFound, parseId, useQuestEditorData } from './quests/useQuests';

function EditSession({ quest }: { quest: QuestEditor }) {
  const initial = useMemo(() => draftFromQuest(quest), [quest]);
  return <EditorSession initial={initial} questId={quest.id} visibility={quest.visibility} />;
}

function EditLoader({ questId }: { questId: number }) {
  const navigate = useNavigate();
  const quest = useQuestEditorData(questId);
  const loaded = quest.data;
  // The loaded quest seeds the session once; later refetches must not reset the work.
  if (loaded) return <EditSession key={loaded.id} quest={loaded} />;
  const forbidden = quest.error instanceof ApiError && quest.error.status === 403;

  return (
    <PanelLayout
      title="Редактирование"
      onBack={() => navigate(`/quests/${questId}`)}
      backLabel="К квесту"
    >
      {forbidden ? (
        <EmptyState
          icon={Lock}
          title="Это чужой квест"
          description="Менять квест может только автор или модератор."
        />
      ) : isNotFound(quest.error) ? (
        <EmptyState
          icon={MapPinOff}
          title="Квест не найден"
          description="Возможно, его уже удалили."
        />
      ) : quest.isError ? (
        <ErrorState error={quest.error} onRetry={() => void quest.refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-16 rounded-card" />
          ))}
        </div>
      )}
    </PanelLayout>
  );
}

function NewSession() {
  const initial = useMemo(() => emptyDraft(), []);
  return <EditorSession initial={initial} questId={null} visibility={null} />;
}

/** `/quests/new` and `/quests/:id/edit` — the quest editor (signed-in users only). */
export default function QuestEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <PanelLayout
        title="Новый квест"
        onBack={() => navigate('/routes?view=quests')}
        backLabel="К квестам"
      >
        <RequireAuth reason="чтобы придумать свой квест">{null}</RequireAuth>
      </PanelLayout>
    );
  }
  return id === undefined ? <NewSession /> : <EditLoader questId={parseId(id)} />;
}
