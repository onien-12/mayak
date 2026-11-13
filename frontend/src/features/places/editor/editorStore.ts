import { create } from 'zustand';

import type { Layer } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

import { forgetEditDrafts } from './draftStore';

/** Values known before the wizard starts (e.g. «Создать встречу здесь»). */
export interface PlaceEditorPreset {
  layer?: Layer;
  point?: LatLng;
  address?: string;
  /** Event held at an existing place (sports ground, public space…). */
  venuePlaceId?: number;
  venueTitle?: string;
  isMeetup?: boolean;
  /** A format chosen up front («Раздача», «Нужна помощь», «Площадка»): the category step is skipped. */
  categorySlug?: string;
  /** The location the place is added to («Добавить место сюда»); the author can change it. */
  areaId?: number;
  /** Where the point picker starts (unlike `point`, the picking step is not skipped). */
  pointHint?: LatLng;
}

export type PlaceEditorSession =
  { mode: 'create'; preset: PlaceEditorPreset } | { mode: 'edit'; placeId: number };

interface PlaceEditorState {
  session: PlaceEditorSession | null;
  open: (session: PlaceEditorSession) => void;
  close: () => void;
}

/** UI state of the create / edit flow, rendered by the shell on top of the current panel. */
export const usePlaceEditor = create<PlaceEditorState>((set) => ({
  session: null,
  open: (session) => {
    forgetEditDrafts();
    set({ session });
  },
  close: () => set({ session: null }),
}));

/**
 * Starts the "add a place" wizard from anywhere. Prefilled values skip the matching steps:
 * `layer` skips the layer choice, `categorySlug` the category, `point` (+ `address`) picking a
 * point on the map.
 * Wrap the call in `requireAuth` — creating needs an account.
 */
export function openCreatePlace(preset: PlaceEditorPreset = {}): void {
  usePlaceEditor.getState().open({ mode: 'create', preset });
}

/** Opens the same form for an existing place. */
export function openEditPlace(placeId: number): void {
  usePlaceEditor.getState().open({ mode: 'edit', placeId });
}
