import { clearDraft } from '../../drafts/storage';
import { useAutosave } from '../../drafts/useAutosave';
import { isQuestDraft, type QuestDraft } from './model';
import { useQuestEditorStore } from './store';

const restoreInto = (draft: QuestDraft) => useQuestEditorStore.getState().restore(draft);

export function clearStoredQuestDraft(questId: number | null): void {
  clearDraft('quest', questId);
}

/** The quest editor's work kept on this device (see `useAutosave`). */
export function useQuestDraftAutosave(questId: number | null) {
  const draft = useQuestEditorStore((state) => state.draft);
  const dirty = useQuestEditorStore((state) => state.dirty);
  return useAutosave({
    kind: 'quest',
    id: questId,
    draft,
    dirty,
    isDraft: isQuestDraft,
    apply: restoreInto,
  });
}
