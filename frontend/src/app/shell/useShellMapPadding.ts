import { useMapPadding } from '@/features/map';
import { useIsDesktop } from '@/shared/hooks';
import { usePanelStore } from '@/shared/ui';

import { MOBILE_TOP_BAR, PANEL_GAP, PANEL_WIDTH, RAIL_WIDTH, TAB_BAR_HEIGHT } from './layout';
import { sheetHeights } from './sheet';
import { useWindowHeight } from './useWindowSize';

/**
 * Keeps the map padding in sync with the layout, so "fly to" and "fit bounds" always
 * target the part of the map that is actually visible (right of the side panel on
 * desktop, above the bottom sheet on phones).
 */
export function useShellMapPadding(): void {
  const isDesktop = useIsDesktop();
  const collapsed = usePanelStore((state) => state.collapsed);
  const snap = usePanelStore((state) => state.snap);
  const peekHeight = usePanelStore((state) => state.peekHeight);
  const heights = sheetHeights(useWindowHeight(), peekHeight);

  const desktopLeft = RAIL_WIDTH + (collapsed ? 0 : PANEL_GAP + PANEL_WIDTH);
  const sheet = snap === 'peek' ? heights.peek : heights.half;

  useMapPadding(
    isDesktop
      ? { top: 0, right: 0, bottom: 0, left: desktopLeft }
      : { top: MOBILE_TOP_BAR, right: 0, bottom: TAB_BAR_HEIGHT + sheet, left: 0 },
  );
}
