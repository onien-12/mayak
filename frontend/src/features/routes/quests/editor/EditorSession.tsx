import { History } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { useMapActions } from '@/features/map';
import { queryKeys, rereadAfterCheck, type QuestEditor, type RouteVisibility } from '@/shared/api';
import { formatRelative, pluralize } from '@/shared/lib/format';
import { boundsOfPoints } from '@/shared/lib/geo';
import { Banner, Button } from '@/shared/ui';

import { useLeaveGuard } from '../../builder/useLeaveGuard';
import { DraftStatus } from '../../drafts/DraftStatus';
import { LeaveDialog } from '../../drafts/LeaveDialog';
import type { StoredDraft } from '../../drafts/storage';
import { QUEST_PLURALS } from '../lib/meta';
import { DetailsStep } from './DetailsStep';
import { EditorMapLayer } from './EditorMapLayer';
import { pointOf, type QuestDraft } from './model';
import { useAccountDraft } from './useAccountDraft';
import { StagesStep } from './StagesStep';
import { useQuestEditorStore } from './store';
import { clearStoredQuestDraft, useQuestDraftAutosave } from './useQuestDraftAutosave';

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
  stored: StoredDraft<QuestDraft>;
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

/** One visit to the quest editor: steps, map layer, stage sheet, drafts and the leave guard. */
export function EditorSession({ initial, questId, visibility }: EditorSessionProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resume = params.get('draft') === '1';
  const [sessionId] = useState(nextSessionId);
  const active = useQuestEditorStore((state) => state.sessionId === sessionId);
  const step = useQuestEditorStore((state) => state.step);
  const dirty = useQuestEditorStore((state) => state.dirty);
  const tool = useQuestEditorStore((state) => state.tool);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [movedTo, setMovedTo] = useState<number | null>(null);
  const autosave = useQuestDraftAutosave(questId);
  const { restore, clear, flush, device } = autosave;
  const { fitBounds } = useMapActions();
  const blocker = useLeaveGuard(active && dirty && savedId === null && movedTo === null, {
    unloadWarning: device.failed,
  });
  const title = questId === null ? 'Новый квест' : 'Редактирование квеста';
  const account = useAccountDraft({
    questId,
    saved: visibility,
    onStored: clear,
    onCreated: setMovedTo,
  });

  const frame = useCallback(
    (restored: QuestDraft | null) => {
      const bounds = boundsOfPoints([
        ...(restored?.start ? [restored.start] : []),
        ...(restored?.stages ?? []).flatMap((stage) => pointOf(stage) ?? []),
      ]);
      if (bounds) fitBounds(bounds, { maxZoom: 16 });
    },
    [fitBounds],
  );

  // «Продолжить» in «Черновики»: the device copy is the work, no second question.
  const resumeDraft = useEffectEvent(() => {
    if (resume) frame(restore());
  });

  useEffect(() => {
    useQuestEditorStore.getState().start(sessionId, initial, questId === null);
    resumeDraft();
  }, [sessionId, initial, questId]);

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
  useEffect(() => {
    if (movedTo !== null) navigate(`/quests/${movedTo}/edit`, { replace: true });
  }, [movedTo, navigate]);

  if (!active) return null;
  const close = () => navigate(questId === null ? '/routes?view=quests' : `/quests/${questId}`);
  const status = <DraftStatus device={device} touched={dirty} account={account} />;

  return (
    <>
      <EditorMapLayer interactive={step === 'stages' || tool === 'start'} />
      {step === 'stages' ? (
        <StagesStep
          title={title}
          onClose={close}
          notice={
            <>
              {autosave.stored && !dirty && (
                <RestorePrompt
                  stored={autosave.stored}
                  onRestore={() => frame(restore())}
                  onDiscard={autosave.discard}
                />
              )}
              {status}
            </>
          }
        />
      ) : (
        <DetailsStep
          title={title}
          questId={questId}
          visibility={visibility}
          onSaved={onSaved}
          notice={status}
        />
      )}
      <LeaveDialog
        blocker={blocker}
        flush={flush}
        failed={device.failed}
        title="Выйти из редактора квеста?"
      />
    </>
  );
}
