import { create } from 'zustand';

import type { LatLng } from '@/shared/lib/geo';

import {
  createStage,
  emptyDraft,
  filledStages,
  MAX_STAGES,
  type DraftErrors,
  type DraftStage,
  type QuestDraft,
} from './model';

export type EditorStep = 'stages' | 'details';
/** The stages step: one stage page at a time, or the overview of all of them. */
export type StagesView = 'stage' | 'overview';
/** What a tap on the map does: place a stage, or the start of the quest. */
export type EditorTool = 'stage' | 'start';
type DraftMeta = Omit<QuestDraft, 'stages' | 'cursor'>;

interface EditorState {
  /** Which mounted editor owns the state (a fresh session on every visit). */
  sessionId: number;
  draft: QuestDraft;
  dirty: boolean;
  step: EditorStep;
  view: StagesView;
  /** The stage whose page is open. */
  currentId: string | null;
  tool: EditorTool;
  /** «Переставить» pressed: the open stage waits for a new point. */
  replacing: boolean;
  errors: DraftErrors;

  /** A new quest opens on stage 1, an existing one on the overview. */
  start: (sessionId: number, draft: QuestDraft, fresh: boolean) => void;
  /** A draft from the device: back to the stage page the author was on. */
  restore: (draft: QuestDraft) => void;
  setMeta: (patch: Partial<DraftMeta>) => void;
  /** A new empty stage page at the end; `null` when the quest is full. */
  appendStage: () => string | null;
  /** Adds a stage at a point and opens its page (a tap on the map in the overview). */
  addStageAt: (point: LatLng, objectId?: string | null) => string | null;
  updateStage: (id: string, patch: Partial<Omit<DraftStage, 'id'>>) => void;
  removeStage: (id: string) => void;
  /** Puts a removed stage back where it was (undo). */
  insertStage: (stage: DraftStage, index: number) => void;
  reorder: (ids: readonly string[]) => void;
  openStage: (id: string) => void;
  openOverview: () => void;
  setStep: (step: EditorStep) => void;
  setTool: (tool: EditorTool) => void;
  setReplacing: (replacing: boolean) => void;
  setErrors: (errors: DraftErrors) => void;
  markSaved: () => void;
}

/** Drops a trailing stage page nobody filled — silently, as if it was never opened. */
function trimmed(draft: QuestDraft): QuestDraft {
  const stages = filledStages(draft.stages);
  return stages.length === draft.stages.length ? draft : { ...draft, stages };
}

/**
 * One visit to the quest editor. Moving between pages is not a change of the quest (the cursor
 * travels with the next autosave); field errors are cleared as soon as the related data changes.
 */
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
  const pageOf = (id: string): Partial<EditorState> => ({
    view: 'stage',
    currentId: id,
    replacing: false,
    tool: 'stage',
    draft: { ...get().draft, cursor: id },
  });

  return {
    sessionId: 0,
    draft: emptyDraft(),
    dirty: false,
    step: 'stages',
    view: 'overview',
    currentId: null,
    tool: 'stage',
    replacing: false,
    errors: {},

    start: (sessionId, draft, fresh) => {
      const first = fresh && draft.stages.length === 0 ? createStage(null) : null;
      const stages = first ? [first] : draft.stages;
      set({
        sessionId,
        draft: { ...draft, stages, cursor: first?.id ?? null },
        dirty: false,
        step: 'stages',
        view: first ? 'stage' : 'overview',
        currentId: first?.id ?? null,
        tool: 'stage',
        replacing: false,
        errors: {},
      });
    },

    restore: (draft) => {
      const cursor = draft.stages.find((stage) => stage.id === draft.cursor)?.id ?? null;
      set({
        draft,
        dirty: true,
        step: 'stages',
        view: cursor ? 'stage' : 'overview',
        currentId: cursor,
        tool: 'stage',
        replacing: false,
        errors: {},
      });
    },

    setMeta: (patch) => {
      const { draft, errors } = get();
      const cleared = Object.fromEntries(Object.keys(patch).map((key) => [key, undefined]));
      set({ draft: { ...draft, ...patch }, dirty: true, errors: { ...errors, ...cleared } });
    },

    appendStage: () => {
      const stages = filledStages(get().draft.stages);
      if (stages.length >= MAX_STAGES) return null;
      const stage = createStage(null);
      changeStages([...stages, stage]);
      set(pageOf(stage.id));
      return stage.id;
    },

    addStageAt: (point, objectId = null) => {
      const stages = filledStages(get().draft.stages);
      if (stages.length >= MAX_STAGES) return null;
      const stage = createStage(point, { objectId });
      changeStages([...stages, stage]);
      set(pageOf(stage.id));
      return stage.id;
    },

    updateStage: (id, patch) => {
      const { draft, errors, replacing, currentId } = get();
      const stageErrors = { ...errors.stage };
      if (stageErrors[id]) {
        const cleared = { ...stageErrors[id] };
        for (const key of Object.keys(patch)) delete cleared[key as keyof typeof cleared];
        if ('lat' in patch) delete cleared.point;
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
        replacing: replacing && !('lat' in patch && id === currentId),
      });
    },

    removeStage: (id) => {
      const { draft, currentId } = get();
      const index = draft.stages.findIndex((stage) => stage.id === id);
      changeStages(draft.stages.filter((stage) => stage.id !== id));
      if (currentId !== id) return;
      // The open page goes: its neighbour opens instead, or the overview when none is left.
      const stages = get().draft.stages;
      const neighbour = stages[Math.max(0, index - 1)];
      if (neighbour) set(pageOf(neighbour.id));
      else set({ view: 'overview', currentId: null, draft: { ...get().draft, cursor: null } });
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

    openStage: (id) => set({ step: 'stages', ...pageOf(id) }),

    openOverview: () =>
      set({
        step: 'stages',
        view: 'overview',
        currentId: null,
        replacing: false,
        draft: { ...trimmed(get().draft), cursor: null },
      }),

    setStep: (step) =>
      set(
        step === 'details'
          ? { step, replacing: false, draft: { ...trimmed(get().draft), cursor: null } }
          : { step, replacing: false },
      ),
    setTool: (tool) => set({ tool, replacing: false }),
    setReplacing: (replacing) => set({ replacing, tool: 'stage' }),
    setErrors: (errors) => set({ errors }),
    markSaved: () => set({ dirty: false }),
  };
});
