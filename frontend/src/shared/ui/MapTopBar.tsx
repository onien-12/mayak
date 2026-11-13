import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useIsDesktop } from '../hooks/useMediaQuery';
import { usePanelSection } from './panelContext';
import { useTopBarSlots } from './topBarSlots';

interface MapTopBarProps {
  /** Goes into the top row next to the logo — usually a search pill. */
  children: ReactNode;
  /** Full-width row under it — usually horizontally scrollable filter chips. */
  extra?: ReactNode;
}

/**
 * Phone-only: lets the active section put its search and quick filters over the map, above
 * the bottom sheet. Renders nothing on desktop or while the section is covered by a card.
 */
export function MapTopBar({ children, extra }: MapTopBarProps) {
  const isDesktop = useIsDesktop();
  const { covered } = usePanelSection();
  const main = useTopBarSlots((state) => state.main);
  const extraSlot = useTopBarSlots((state) => state.extra);

  if (isDesktop || covered) return null;

  return (
    <>
      {main && createPortal(children, main)}
      {extra && extraSlot && createPortal(extra, extraSlot)}
    </>
  );
}
