import { motion } from 'motion/react';
import { Suspense, type CSSProperties } from 'react';
import { Outlet } from 'react-router';

import { useIsDesktop } from '@/shared/hooks';
import { popVariants, Spinner, SPRING, useOverlayStore } from '@/shared/ui';

import { PANEL_GAP, RAIL_WIDTH, TAB_BAR_HEIGHT } from './layout';

/**
 * Layout route of wide pages (profile, moderation, statistics) that cover the map.
 * Phones: slides up as a full-screen page above the tab bar. Desktop: fades and scales in
 * as a floating sheet next to the nav rail. A page can minimise itself (`useMinimizeOverlay`)
 * to let the user work with the map, e.g. pick the centre of a territory subscription.
 */
export function OverlayRoute() {
  const isDesktop = useIsDesktop();
  const minimized = useOverlayStore((state) => state.minimized);
  const frame: CSSProperties = isDesktop
    ? { top: PANEL_GAP, right: PANEL_GAP, bottom: PANEL_GAP, left: RAIL_WIDTH + PANEL_GAP }
    : {
        top: 0,
        right: 0,
        left: 0,
        bottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
      };

  return (
    <motion.main
      style={frame}
      inert={minimized}
      {...(isDesktop
        ? { variants: popVariants, initial: 'hidden', animate: minimized ? 'exit' : 'visible' }
        : {
            initial: { y: 48, opacity: 0 },
            animate: minimized ? { y: '100%', opacity: 0 } : { y: 0, opacity: 1 },
            transition: SPRING.sheet,
          })}
      className="absolute z-30 overflow-hidden bg-surface lg:rounded-panel lg:border lg:border-line/60 lg:shadow-float"
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner size={24} />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </motion.main>
  );
}
