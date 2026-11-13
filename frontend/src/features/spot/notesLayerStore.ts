import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotesLayerState {
  /** Note bubbles are drawn on the map (switchable in the filters, SPEC §13). */
  visible: boolean;
  toggle: () => void;
}

export const useNotesLayer = create<NotesLayerState>()(
  persist(
    (set, get) => ({
      visible: true,
      toggle: () => set({ visible: !get().visible }),
    }),
    { name: 'mayak-notes-layer', version: 1 },
  ),
);
