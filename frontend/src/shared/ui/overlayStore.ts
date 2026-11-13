import { useEffect } from 'react';
import { create } from 'zustand';

interface OverlayState {
  /** The overlay page slides away so the map underneath can be used (pick a point). */
  minimized: boolean;
  setMinimized: (minimized: boolean) => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  minimized: false,
  setMinimized: (minimized) => set({ minimized }),
}));

/**
 * While `active`, the current overlay page (profile, moderation…) gets out of the way and
 * reveals the map; it slides back when `active` turns false or the caller unmounts.
 * Render the controls the user needs meanwhile in a portal — the page itself is hidden.
 */
export function useMinimizeOverlay(active: boolean): void {
  const setMinimized = useOverlayStore((state) => state.setMinimized);

  useEffect(() => {
    if (!active) return;
    setMinimized(true);
    return () => setMinimized(false);
  }, [active, setMinimized]);
}
