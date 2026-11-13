import { create } from 'zustand';

import type { GeoPolygon } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

/** Values known before the territory editor opens (e.g. from a tapped 2GIS object). */
export interface AreaEditorPreset {
  /** Where the territory is: centres the map and the circle; defaults to the map centre. */
  point?: LatLng;
  title?: string;
  /** Linked 2GIS object — its own boundary is looked up first. */
  objectId?: string;
  /** A ready territory (it can still be refined by hand). */
  geometry?: GeoPolygon;
  /** Start radius of the circle fallback, metres. */
  radiusM?: number;
}

export type AreaEditorSession =
  { mode: 'create'; preset: AreaEditorPreset } | { mode: 'edit'; areaId: number };

interface AreaEditorState {
  session: AreaEditorSession | null;
  open: (session: AreaEditorSession) => void;
  close: () => void;
}

/** UI state of the area editor, rendered by the shell on top of the current panel. */
export const useAreaEditor = create<AreaEditorState>((set) => ({
  session: null,
  open: (session) => set({ session }),
  close: () => set({ session: null }),
}));

/**
 * Opens the territory editor for a new area. Only level `trusted`+ and moderators may
 * create areas — show the entry point when `useCanManageAreas()` is true and wrap the call
 * in `requireAuth`.
 */
export function openCreateArea(preset: AreaEditorPreset = {}): void {
  useAreaEditor.getState().open({ mode: 'create', preset });
}

export function openEditArea(areaId: number): void {
  useAreaEditor.getState().open({ mode: 'edit', areaId });
}
