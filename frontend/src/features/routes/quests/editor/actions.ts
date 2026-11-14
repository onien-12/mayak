import { toast } from '@/shared/ui';

import { filledStages, stageErrors, validateDraft, type DraftErrors } from './model';
import { useQuestEditorStore } from './store';

/** Undo-able removal of a stage. */
export function removeStageWithUndo(id: string): void {
  const store = useQuestEditorStore.getState();
  const index = store.draft.stages.findIndex((stage) => stage.id === id);
  const stage = store.draft.stages[index];
  if (!stage) return;
  store.removeStage(id);
  toast.info(`Этап ${index + 1} удалён`, {
    label: 'Вернуть',
    onClick: () => useQuestEditorStore.getState().insertStage(stage, index),
  });
}

/** Shows what stops the stage page from moving on; `true` when nothing does. */
export function checkStage(id: string): boolean {
  const store = useQuestEditorStore.getState();
  const stage = store.draft.stages.find((item) => item.id === id);
  if (!stage) return true;
  const found = stageErrors(stage);
  if (Object.keys(found).length === 0) return true;
  store.setErrors({ ...store.errors, stage: { ...store.errors.stage, [id]: found } });
  return false;
}

/**
 * After a failed check of the whole quest: the first unfinished stage opens with its messages,
 * other problems (too few stages) are shown on the overview.
 */
export function showStageProblems(errors: DraftErrors): void {
  const store = useQuestEditorStore.getState();
  store.setErrors(errors);
  const first = filledStages(store.draft.stages).find((stage) => errors.stage?.[stage.id]);
  if (first) store.openStage(first.id);
  else store.openOverview();
}

/** «К описанию квеста»: the trailing empty page is dropped, the stages must be complete. */
export function finishStages(): void {
  const store = useQuestEditorStore.getState();
  const errors = validateDraft(store.draft);
  if (errors.stage || errors.stages) {
    showStageProblems({ stage: errors.stage, stages: errors.stages });
    return;
  }
  store.setErrors({});
  store.setStep('details');
}
