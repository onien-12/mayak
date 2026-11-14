import { create } from 'zustand';

import type { LatLng } from '@/shared/lib/geo';

import {
  createStage,
  emptyDraft,
  MAX_STAGES,
  type DraftErrors,
  type DraftStage,
  type QuestDraft,
} from './model';

export type EditorStep = 'stages' | 'details';
/** What a tap on the map does: put a stage there, or the start of the quest. */
export type EditorTool = 'stage' | 'start';
type DraftMeta = Omit<QuestDraft, 'stages'>;

interface EditorState {
  /** Which mounted editor owns the state (a fresh session on every visit). */
  sessionId: number;
  draft: QuestDraft;
  dirty: boolean;
  step: EditorStep;
  tool: EditorTool;
  editingId: string | null;
  /** «Добавить этап» pressed: waiting for a tap on the map (or «в центре карты»). */
  placing: boolean;
  errors: DraftErrors;

  start: (sessionId: number, draft: QuestDraft) => void;
  restore: (draft: QuestDraft) => void;
  setMeta: (patch: Partial<DraftMeta>) => void;
  /** Adds a stage at the point and opens it; `null` when the quest is full. */
  addStage: (point: LatLng, objectId?: string | null) => string | null;
  updateStage: (id: string, patch: Partial<Omit<DraftStage, 'id'>>) => void;
  removeStage: (id: string) => void;
  /** Puts a removed stage back where it was (undo). */
  insertStage: (stage: DraftStage, index: number) => void;
  reorder: (ids: readonly string[]) => void;
  setStep: (step: EditorStep) => void;
  setTool: (tool: EditorTool) => void;
  setPlacing: (placing: boolean) => void;
  openEditor: (id: string | null) => void;
  setErrors: (errors: DraftErrors) => void;
  markSaved: () => void;
}

/** One visit to the quest editor. Field errors are cleared as soon as the related data changes. */
export const useQuestEditorStore = create<EditorState>((set, get) => {
  const changeStages = (stages: DraftStage[], extra: Partial<EditorState> = {}) => {
    const { draft, errors } = get();
    set({
      draft: { ...draft, stages },
      dirty: true,
      errors: { ...errors, stages: undefined },
      ...extra,
    });
  };

  return {
    sessionId: 0,
    draft: emptyDraft(),
    dirty: false,
    step: 'stages',
    tool: 'stage',
    editingId: null,
    placing: false,
    errors: {},

    start: (sessionId, draft) =>
      set({
        sessionId,
        draft,
        dirty: false,
        step: 'stages',
        tool: draft.start ? 'stage' : 'start',
        editingId: null,
        placing: false,
        errors: {},
      }),

    restore: (draft) => set({ draft, dirty: true, editingId: null, errors: {} }),

    setMeta: (patch) => {
      const { draft, errors } = get();
      const cleared = Object.fromEntries(Object.keys(patch).map((key) => [key, undefined]));
      set({ draft: { ...draft, ...patch }, dirty: true, errors: { ...errors, ...cleared } });
    },

    addStage: (point, objectId = null) => {
      const { draft } = get();
      if (draft.stages.length >= MAX_STAGES) return null;
      const stage = createStage(point, { objectId });
      changeStages([...draft.stages, stage], { editingId: stage.id, placing: false });
      return stage.id;
    },

    updateStage: (id, patch) => {
      const { draft, errors } = get();
      const stageErrors = { ...errors.stage };
      if (stageErrors[id]) {
        const cleared = { ...stageErrors[id] };
        for (const key of Object.keys(patch)) delete cleared[key as keyof typeof cleared];
        if ('code' in patch || 'condition' in patch) delete cleared.code;
        stageErrors[id] = cleared;
      }
      set({
        draft: {
          ...draft,
          stages: draft.stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)),
        },
        dirty: true,
        errors: { ...errors, stage: stageErrors },
      });
    },

    removeStage: (id) => {
      const { draft, editingId } = get();
      changeStages(
        draft.stages.filter((stage) => stage.id !== id),
        { editingId: editingId === id ? null : editingId },
      );
    },

    insertStage: (stage, index) => {
      const stages = [...get().draft.stages];
      stages.splice(index, 0, stage);
      changeStages(stages);
    },

    reorder: (ids) => {
      const byId = new Map(get().draft.stages.map((stage) => [stage.id, stage]));
      changeStages(ids.flatMap((id) => byId.get(id) ?? []));
    },

    setStep: (step) => set({ step, editingId: null, placing: false }),
    setTool: (tool) => set({ tool, placing: false }),
    setPlacing: (placing) => set(placing ? { placing, tool: 'stage' } : { placing }),
    openEditor: (id) => set({ editingId: id }),
    setErrors: (errors) => set({ errors }),
    markSaved: () => set({ dirty: false }),
  };
});

/** Stable on purpose: the dialog re-runs its focus handling when `onClose` changes. */
export const closeStageEditor = () => useQuestEditorStore.getState().openEditor(null);
