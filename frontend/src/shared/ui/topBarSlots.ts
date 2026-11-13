import { create } from 'zustand';

interface TopBarSlots {
  main: HTMLElement | null;
  extra: HTMLElement | null;
  setMain: (element: HTMLElement | null) => void;
  setExtra: (element: HTMLElement | null) => void;
}

/** Portal targets registered by the phone shell (see `MapChrome`). */
export const useTopBarSlots = create<TopBarSlots>((set) => ({
  main: null,
  extra: null,
  setMain: (main) => set({ main }),
  setExtra: (extra) => set({ extra }),
}));
