import { useEffect } from 'react';
import { create } from 'zustand';

import type { AreaCard } from '@/shared/api';

/**
 * Display list of the area layer — like the place scene: the section's areas plus the open
 * one. Holds references to query results only.
 */
interface AreaLayerState {
  sectionAreas: readonly AreaCard[];
  /** The open area: drawn even when the section's list does not contain it. */
  focusArea: AreaCard | null;
  /** «Для вас» (SPEC §23.5): drawn too, first in line for a labelled pill, with an accent. */
  recommended: readonly AreaCard[];
  setSectionAreas: (areas: readonly AreaCard[]) => void;
  setFocusArea: (area: AreaCard | null) => void;
  setRecommended: (areas: readonly AreaCard[]) => void;
}

export const useAreaLayer = create<AreaLayerState>((set) => ({
  sectionAreas: [],
  focusArea: null,
  recommended: [],
  setSectionAreas: (sectionAreas) => set({ sectionAreas }),
  setFocusArea: (focusArea) => set({ focusArea }),
  setRecommended: (recommended) => set({ recommended }),
}));

/**
 * Draws the given areas (pills + faint territories) while the caller is mounted. Pass
 * `undefined` while loading to keep the previous ones on screen.
 */
export function useMapAreas(areas: readonly AreaCard[] | undefined): void {
  const setSectionAreas = useAreaLayer((state) => state.setSectionAreas);

  useEffect(() => {
    if (areas) setSectionAreas(areas);
  }, [areas, setSectionAreas]);

  useEffect(() => () => setSectionAreas([]), [setSectionAreas]);
}

/**
 * Marks areas as recommended to the viewer while mounted: drawn even when the section's
 * list lacks them, kept as labelled pills when zoomed out, with a quiet accent.
 */
export function useMapRecommendedAreas(areas: readonly AreaCard[] | undefined): void {
  const setRecommended = useAreaLayer((state) => state.setRecommended);

  useEffect(() => {
    if (!areas) return;
    setRecommended(areas);
    return () => setRecommended([]);
  }, [areas, setRecommended]);
}

/** Keeps the open area on the map (selected pill + territory outline). */
export function useMapFocusArea(area: AreaCard | null | undefined): void {
  const setFocusArea = useAreaLayer((state) => state.setFocusArea);

  useEffect(() => {
    setFocusArea(area ?? null);
    return () => setFocusArea(null);
  }, [area, setFocusArea]);
}
