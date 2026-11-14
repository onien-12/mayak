import { create } from 'zustand';

import type { LatLng } from '@/shared/lib/geo';

import {
  createStop,
  emptyDraft,
  insertStop,
  MAX_STOPS,
  removeStop,
  reorderStops,
  updateStop,
  viaInsertIndex,
  type DraftErrors,
  type DraftStop,
  type RouteDraft,
} from './model';

export type BuilderStep = 'points' | 'details';
/** What a tap on the map does in the «Точки» step. */
export type BuilderTool = 'stop' | 'via' | 'places';
type DraftMeta = Omit<RouteDraft, 'stops'>;

interface BuilderState {
  /** Which mounted builder owns the state (a fresh session on every visit). */
  sessionId: number;
  draft: RouteDraft;
  /** Unsaved changes since the session started (drives autosave and the leave guard). */
  dirty: boolean;
  step: BuilderStep;
  tool: BuilderTool;
  /** Stop open in the editor sheet. */
  editingId: string | null;
  /** Stop highlighted in the list and on the map. */
  selectedId: string | null;
  /** Index the next stop is inserted at («вставить между»); `null` appends. */
  insertAt: number | null;
  /** «Добавить точку» pressed: waiting for a tap on the map (or «в центре карты»). */
  placing: boolean;
  errors: DraftErrors;

  start: (sessionId: number, draft: RouteDraft) => void;
  /** Replaces the draft with one restored from the device (it still has to be saved). */
  restore: (draft: RouteDraft) => void;
  setMeta: (patch: Partial<DraftMeta>) => void;
  /** Adds a visible stop; returns its id, or `null` when the route is full. */
  addStop: (point: LatLng, fields?: Partial<Omit<DraftStop, 'id'>>) => string | null;
  addVia: (point: LatLng) => string | null;
  updateStop: (id: string, patch: Partial<Omit<DraftStop, 'id'>>) => void;
  removeStop: (id: string) => { stop: DraftStop; index: number } | null;
  restoreStop: (stop: DraftStop, index: number) => void;
  reorder: (ids: readonly string[]) => void;
  setStep: (step: BuilderStep) => void;
  setTool: (tool: BuilderTool) => void;
  openEditor: (id: string | null) => void;
  select: (id: string | null) => void;
  setInsertAt: (index: number | null) => void;
  setPlacing: (placing: boolean) => void;
  setErrors: (errors: DraftErrors) => void;
  markSaved: () => void;
}

/**
 * State of one builder session (create or edit). All changes to stops go through the pure
 * functions of `model.ts`; field errors are cleared as soon as the related data changes.
 */
export const useBuilderStore = create<BuilderState>((set, get) => {
  const changeStops = (stops: DraftStop[], extra: Partial<BuilderState> = {}) => {
    const { draft, errors } = get();
    set({
      draft: { ...draft, stops },
      dirty: true,
      errors: { ...errors, stops: undefined },
      ...extra,
    });
  };

  return {
    sessionId: 0,
    draft: emptyDraft(),
    dirty: false,
    step: 'points',
    tool: 'stop',
    editingId: null,
    selectedId: null,
    insertAt: null,
    placing: false,
    errors: {},

    start: (sessionId, draft) =>
      set({
        sessionId,
        draft,
        dirty: false,
        step: 'points',
        tool: 'stop',
        editingId: null,
        selectedId: null,
        insertAt: null,
        placing: false,
        errors: {},
      }),

    restore: (draft) =>
      set({ draft, dirty: true, editingId: null, selectedId: null, insertAt: null, errors: {} }),

    setMeta: (patch) => {
      const { draft, errors } = get();
      const cleared = Object.fromEntries(Object.keys(patch).map((key) => [key, undefined]));
      set({ draft: { ...draft, ...patch }, dirty: true, errors: { ...errors, ...cleared } });
    },

    addStop: (point, fields) => {
      const { draft, insertAt } = get();
      if (draft.stops.length >= MAX_STOPS) return null;
      const stop = createStop(point, fields);
      const index = insertAt ?? undefined;
      changeStops(insertStop(draft.stops, stop, index), {
        selectedId: stop.id,
        insertAt: insertAt === null ? null : insertAt + 1,
        placing: false,
      });
      return stop.id;
    },

    addVia: (point) => {
      const { draft } = get();
      if (draft.stops.length >= MAX_STOPS) return null;
      const stop = createStop(point, { kind: 'via' });
      changeStops(insertStop(draft.stops, stop, viaInsertIndex(draft.stops, point)));
      return stop.id;
    },

    updateStop: (id, patch) => changeStops(updateStop(get().draft.stops, id, patch)),

    removeStop: (id) => {
      const { draft, editingId, selectedId } = get();
      const result = removeStop(draft.stops, id);
      changeStops(result.stops, {
        editingId: editingId === id ? null : editingId,
        selectedId: selectedId === id ? null : selectedId,
        insertAt: null,
      });
      return result.removed;
    },

    restoreStop: (stop, index) => changeStops(insertStop(get().draft.stops, stop, index)),

    reorder: (ids) => changeStops(reorderStops(get().draft.stops, ids)),

    setStep: (step) => set({ step, editingId: null, insertAt: null, placing: false }),
    setTool: (tool) => set({ tool, insertAt: tool === 'via' ? null : get().insertAt }),
    openEditor: (id) => set({ editingId: id, selectedId: id ?? get().selectedId }),
    select: (id) => set({ selectedId: id }),
    setInsertAt: (insertAt) => set({ insertAt, tool: 'stop' }),
    setPlacing: (placing) => set(placing ? { placing, tool: 'stop' } : { placing }),
    setErrors: (errors) => set({ errors }),
    markSaved: () => set({ dirty: false }),
  };
});
