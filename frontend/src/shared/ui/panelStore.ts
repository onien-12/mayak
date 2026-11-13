import { useEffect } from 'react';
import { create } from 'zustand';

/** Bottom-sheet snap points on phones: header only, half screen, almost full screen. */
export type SheetSnap = 'peek' | 'half' | 'full';

interface PanelState {
  /** Desktop: the side panel is hidden to reveal the whole map. */
  collapsed: boolean;
  /** Phones: current bottom-sheet snap point. */
  snap: SheetSnap;
  /** Phones: custom height of the `peek` snap in px (`null` = default ≈ 96 px). */
  peekHeight: number | null;
  /** Mounted sections that offer the global «Добавить» (see `useOfferAddPlace`). */
  addPlaceOffers: number;
  setCollapsed: (collapsed: boolean) => void;
  setSnap: (snap: SheetSnap) => void;
  setPeekHeight: (height: number | null) => void;
  addAddPlaceOffer: (delta: 1 | -1) => void;
  /** Makes sure the panel content is visible (expands the panel / raises the sheet to half). */
  reveal: () => void;
  /** Gets the panel out of the way so the map is usable (look at a route, pick a point). */
  showMap: () => void;
}

/**
 * Layout state of the section container — side panel on desktop, bottom sheet on phones.
 * Sections drive it through `reveal()`, `showMap()` and `setSnap()`.
 */
export const usePanelStore = create<PanelState>((set, get) => ({
  collapsed: false,
  snap: 'half',
  peekHeight: null,
  addPlaceOffers: 0,
  setCollapsed: (collapsed) => set({ collapsed }),
  setSnap: (snap) => set({ snap }),
  setPeekHeight: (peekHeight) => set({ peekHeight }),
  addAddPlaceOffer: (delta) => set({ addPlaceOffers: get().addPlaceOffers + delta }),
  reveal: () => set({ collapsed: false, snap: get().snap === 'peek' ? 'half' : get().snap }),
  showMap: () => set({ snap: 'peek' }),
}));

/**
 * While mounted, makes the sheet's `peek` snap taller than the default — for steps that
 * need a few controls visible while the user works with the map (e.g. confirming a point).
 */
export function useSheetPeek(height: number | null): void {
  const setPeekHeight = usePanelStore((state) => state.setPeekHeight);

  useEffect(() => {
    if (height === null) return;
    setPeekHeight(height);
    return () => setPeekHeight(null);
  }, [height, setPeekHeight]);
}

/**
 * The global «Добавить» (FAB on phones, «Добавить место» on desktop) is shown only where
 * adding a place is the natural primary action: a section opts in while it is active —
 * the explore map with nothing on top of it. Every other screen (sections with their own
 * footer action, cards, editors, focused tasks) leaves it hidden.
 */
export function useOfferAddPlace(active = true): void {
  const addAddPlaceOffer = usePanelStore((state) => state.addAddPlaceOffer);

  useEffect(() => {
    if (!active) return;
    addAddPlaceOffer(1);
    return () => addAddPlaceOffer(-1);
  }, [active, addAddPlaceOffer]);
}
