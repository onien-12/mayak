import { useMutation, useQueryClient } from '@tanstack/react-query';

import { errorMessage, queryKeys, questsApi, type RouteVisibility } from '@/shared/api';
import { toast } from '@/shared/ui';

import type { AccountBlocker, AccountSave } from '../../drafts/DraftStatus';
import { MIN_STAGES, toQuestInput, validateDraft, type QuestDraft } from './model';
import { useQuestEditorStore } from './store';

export const ACCOUNT_DRAFT_SAVED =
  'Черновик сохранён в аккаунт — он в разделе «Маршруты» → «Квесты»';

function toDetails(field: 'title' | 'startTitle', message: string): () => void {
  return () => {
    const store = useQuestEditorStore.getState();
    store.setStep('details');
    store.setErrors({ [field]: message });
  };
}

function blockerOf(draft: QuestDraft): AccountBlocker | null {
  const missing = MIN_STAGES - draft.stages.length;
  if (missing >= 2) return { text: 'добавьте два этапа' };
  if (missing === 1) return { text: 'добавьте ещё один этап' };
  const errors = validateDraft(draft);
  const unfinished = draft.stages.findIndex((stage) => errors.stage?.[stage.id]);
  if (unfinished !== -1) {
    const stage = draft.stages[unfinished];
    return {
      text: `допишите этап ${unfinished + 1}`,
      fix: {
        label: 'Открыть',
        run: () => {
          const store = useQuestEditorStore.getState();
          store.setStep('stages');
          store.setErrors(errors);
          if (stage) store.openEditor(stage.id);
        },
      },
    };
  }
  if (errors.start) {
    return {
      text: 'отметьте старт на карте',
      fix: {
        label: 'Отметить',
        run: () => {
          const store = useQuestEditorStore.getState();
          store.setStep('stages');
          store.setTool('start');
        },
      },
    };
  }
  if (errors.title) {
    return {
      text: 'назовите квест',
      fix: { label: 'Назвать', run: toDetails('title', errors.title) },
    };
  }
  if (errors.startTitle) {
    return {
      text: 'напишите, где собираться',
      fix: { label: 'Написать', run: toDetails('startTitle', errors.startTitle) },
    };
  }
  return null;
}

interface AccountDraftOptions {
  questId: number | null;
  /** Visibility of the quest as saved; `null` for a new one. */
  saved: RouteVisibility | null;
  onStored: () => void;
  onCreated: (questId: number) => void;
}

/**
 * «Сохранить черновик в аккаунт»: the quest as a private draft, visible only to its author.
 * Offered for a new quest and for a draft — a published quest is kept by its own save.
 */
export function useAccountDraft({
  questId,
  saved,
  onStored,
  onCreated,
}: AccountDraftOptions): AccountSave | null {
  const queryClient = useQueryClient();
  const draft = useQuestEditorStore((state) => state.draft);
  const save = useMutation({
    mutationFn: () => {
      const input = toQuestInput(draft, 'private');
      return questId === null ? questsApi.create(input) : questsApi.update(questId, input);
    },
    onSuccess: (quest) => {
      useQuestEditorStore.getState().markSaved();
      onStored();
      // The editor of a saved quest keeps its session: its own query is left alone.
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.mine });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.quests.detail(quest.id),
        exact: true,
      });
      toast.success(ACCOUNT_DRAFT_SAVED);
      if (questId === null) {
        queryClient.setQueryData(queryKeys.quests.editor(quest.id), quest);
        onCreated(quest.id);
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (saved === 'public') return null;
  return { blocker: blockerOf(draft), saving: save.isPending, onSave: () => save.mutate() };
}
