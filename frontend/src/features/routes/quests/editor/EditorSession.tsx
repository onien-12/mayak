import { History } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { useMapActions } from '@/features/map';
import { queryKeys, rereadAfterCheck, type QuestEditor, type RouteVisibility } from '@/shared/api';
import { formatRelative, pluralize } from '@/shared/lib/format';
import { boundsOfPoints } from '@/shared/lib/geo';
import { Banner, Button, ConfirmDialog } from '@/shared/ui';

import { useLeaveGuard } from '../../builder/useLeaveGuard';
import { QUEST_PLURALS } from '../lib/meta';
import { DetailsStep } from './DetailsStep';
import { EditorMapLayer } from './EditorMapLayer';
import type { QuestDraft } from './model';
import { StageSheet } from './StageSheet';
import { StagesStep } from './StagesStep';
import { useQuestEditorStore } from './store';
import {
  clearStoredQuestDraft,
  useQuestDraftAutosave,
  type StoredQuestDraft,
} from './useQuestDraftAutosave';

let sessions = 0;
const nextSessionId = () => {
  sessions += 1;
  return sessions;
};

function RestorePrompt({
  stored,
  onRestore,
  onDiscard,
}: {
  stored: StoredQuestDraft;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <Banner
      tone="beam"
      icon={History}
      title="Есть несохранённый черновик"
      action={
        <div className="flex gap-2">
          <Button size="sm" onClick={onRestore}>
            Продолжить
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            Начать заново
          </Button>
        </div>
      }
    >
      {[
        `Изменён ${formatRelative(stored.savedAt)}`,
        pluralize(stored.draft.stages.length, QUEST_PLURALS.stage),
        stored.draft.title && `«${stored.draft.title}»`,
      ]
        .filter(Boolean)
        .join(' · ')}
    </Banner>
  );
}

interface EditorSessionProps {
  initial: QuestDraft;
  questId: number | null;
  visibility: RouteVisibility | null;
}

/** One visit to the quest editor: steps, map layer, stage sheet, autosave and the leave guard. */
export function EditorSession({ initial, questId, visibility }: EditorSessionProps) {
  const navigate = useNavigate();
  const [sessionId] = useState(nextSessionId);
  const active = useQuestEditorStore((state) => state.sessionId === sessionId);
  const step = useQuestEditorStore((state) => state.step);
  const dirty = useQuestEditorStore((state) => state.dirty);
  const editing = useQuestEditorStore((state) => state.editingId !== null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const autosave = useQuestDraftAutosave(questId);
  const { fitBounds } = useMapActions();
  const blocker = useLeaveGuard(active && dirty && savedId === null);
  const title = questId === null ? 'Новый квест' : 'Редактирование квеста';

  useEffect(() => {
    useQuestEditorStore.getState().start(sessionId, initial);
  }, [sessionId, initial]);

  const onSaved = useCallback(
    (quest: QuestEditor) => {
      clearStoredQuestDraft(questId);
      if (quest.visibility === 'public') rereadAfterCheck([queryKeys.quests.detail(quest.id)]);
      setSavedId(quest.id);
    },
    [questId],
  );

  // After the render that switched the leave guard off.
  useEffect(() => {
    if (savedId !== null) navigate(`/quests/${savedId}`, { replace: true });
  }, [savedId, navigate]);

  if (!active) return null;
  const close = () => navigate(questId === null ? '/routes?view=quests' : `/quests/${questId}`);

  return (
    <>
      <EditorMapLayer interactive={step === 'stages' && !editing} />
      {step === 'stages' ? (
        <StagesStep
          title={title}
          onClose={close}
          notice={
            autosave.stored &&
            !dirty && (
              <RestorePrompt
                stored={autosave.stored}
                onRestore={() => {
                  const restored = autosave.restore();
                  const bounds = boundsOfPoints(restored?.stages ?? []);
                  if (bounds) fitBounds(bounds, { maxZoom: 16 });
                }}
                onDiscard={autosave.discard}
              />
            )
          }
        />
      ) : (
        <DetailsStep title={title} questId={questId} visibility={visibility} onSaved={onSaved} />
      )}
      <StageSheet />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Выйти из редактора?"
        description="Изменения не сохранены на сервере, но черновик останется на этом устройстве — к нему можно вернуться."
        confirmLabel="Выйти"
        cancelLabel="Остаться"
      />
    </>
  );
}
