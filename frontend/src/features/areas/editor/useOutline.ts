import { useCallback, useMemo, useReducer } from 'react';

import type { GeoPosition } from '@/shared/api';

interface OutlineState {
  vertices: GeoPosition[];
  /** Previous versions for «Отменить». */
  history: GeoPosition[][];
  selected: number | null;
}

type OutlineAction =
  | { type: 'add'; position: GeoPosition }
  | { type: 'move'; index: number; position: GeoPosition }
  | { type: 'insert'; index: number; position: GeoPosition }
  | { type: 'remove'; index: number }
  | { type: 'select'; index: number | null }
  | { type: 'replace'; vertices: GeoPosition[] }
  | { type: 'undo' };

const HISTORY_LIMIT = 50;

function commit(state: OutlineState, vertices: GeoPosition[], selected: number | null) {
  return {
    vertices,
    history: [...state.history.slice(-HISTORY_LIMIT), state.vertices],
    selected,
  };
}

function reducer(state: OutlineState, action: OutlineAction): OutlineState {
  const { vertices } = state;
  switch (action.type) {
    case 'add':
      return commit(state, [...vertices, action.position], null);
    case 'move':
      return commit(state, vertices.with(action.index, action.position), state.selected);
    case 'insert':
      return commit(state, vertices.toSpliced(action.index, 0, action.position), action.index);
    case 'remove':
      return commit(state, vertices.toSpliced(action.index, 1), null);
    case 'select':
      return { ...state, selected: action.index };
    case 'replace':
      return commit(state, action.vertices, null);
    case 'undo': {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return { vertices: previous, history: state.history.slice(0, -1), selected: null };
    }
  }
}

/** Hand-drawn territory outline: vertices with selection and undo. */
export function useOutline(initial: GeoPosition[]) {
  const [state, dispatch] = useReducer(reducer, { vertices: initial, history: [], selected: null });

  const add = useCallback((position: GeoPosition) => dispatch({ type: 'add', position }), []);
  const move = useCallback(
    (index: number, position: GeoPosition) => dispatch({ type: 'move', index, position }),
    [],
  );
  const insert = useCallback(
    (index: number, position: GeoPosition) => dispatch({ type: 'insert', index, position }),
    [],
  );
  const remove = useCallback((index: number) => dispatch({ type: 'remove', index }), []);
  const select = useCallback((index: number | null) => dispatch({ type: 'select', index }), []);
  const replace = useCallback(
    (vertices: GeoPosition[]) => dispatch({ type: 'replace', vertices }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);

  return useMemo(
    () => ({
      vertices: state.vertices,
      selected: state.selected,
      canUndo: state.history.length > 0,
      add,
      move,
      insert,
      remove,
      select,
      replace,
      undo,
      clear: () => replace([]),
    }),
    [state, add, move, insert, remove, select, replace, undo],
  );
}

export type Outline = ReturnType<typeof useOutline>;
