import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { SPRING, usePanelStore, type SheetSnap } from '@/shared/ui';

import { TAB_BAR_HEIGHT } from './layout';
import { sheetHeights } from './sheet';
import { useSheetGestures } from './useSheetGestures';
import { useWindowHeight } from './useWindowSize';

interface BottomSheetProps {
  /** Controls that ride on the sheet's top edge (FAB, «где я»); hidden at full height. */
  floating?: ReactNode;
  children: ReactNode;
}

/**
 * Phone container of the panel: a draggable bottom sheet with three snap points
 * (`peek` / `half` / `full`). Moves by `transform` only, settles with a spring that
 * continues the release velocity, dims the map only at full height.
 * Driven by `usePanelStore` (`snap`, `reveal()`, `showMap()`, `useSheetPeek()`).
 */
export function BottomSheet({ floating, children }: BottomSheetProps) {
  const snap = usePanelStore((state) => state.snap);
  const setSnap = usePanelStore((state) => state.setSnap);
  const peekHeight = usePanelStore((state) => state.peekHeight);
  const windowHeight = useWindowHeight();
  const heights = useMemo(() => sheetHeights(windowHeight, peekHeight), [windowHeight, peekHeight]);
  const reducedMotion = useReducedMotion();

  const sheetRef = useRef<HTMLDivElement>(null);
  const releaseVelocity = useRef(0);
  const [dragging, setDragging] = useState(false);
  const offset = useMotionValue(heights.full - heights[snap]);
  const halfOffset = heights.full - heights.half;
  const backdropOpacity = useTransform(offset, [0, halfOffset], [1, 0], { clamp: true });
  const floatingOpacity = useTransform(offset, [halfOffset * 0.4, halfOffset], [0, 1], {
    clamp: true,
  });

  useEffect(() => {
    const target = heights.full - heights[snap];
    const velocity = releaseVelocity.current;
    releaseVelocity.current = 0;
    if (reducedMotion) {
      offset.set(target);
      return;
    }
    const controls = animate(offset, target, { ...SPRING.sheet, velocity });
    return () => controls.stop();
  }, [offset, heights, snap, reducedMotion]);

  const settle = (target: SheetSnap, velocity: number) => {
    setDragging(false);
    if (target === snap) {
      animate(offset, heights.full - heights[target], { ...SPRING.sheet, velocity });
    } else {
      releaseVelocity.current = velocity;
      setSnap(target);
    }
  };

  useSheetGestures(sheetRef, {
    offset,
    heights,
    snap,
    onDragStart: () => setDragging(true),
    onRelease: settle,
    onTap: () => setSnap(snap === 'peek' ? 'half' : snap),
  });

  const bottom = `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;

  return (
    <>
      <motion.div
        aria-hidden
        style={{ opacity: backdropOpacity, bottom }}
        onClick={() => setSnap('half')}
        className={`absolute inset-x-0 top-0 z-30 bg-ink/35 ${snap === 'full' ? '' : 'pointer-events-none'}`}
      />
      <motion.div
        ref={sheetRef}
        data-sheet-snap={dragging ? 'dragging' : snap}
        style={{ y: offset, height: heights.full, bottom }}
        className="absolute inset-x-0 z-30 flex flex-col rounded-t-panel bg-surface shadow-float will-change-transform"
      >
        {floating && (
          <motion.div
            data-sheet-ignore
            style={{ opacity: floatingOpacity }}
            className={`pointer-events-none absolute right-3 bottom-full flex flex-col items-end gap-2.5 pb-3 ${snap === 'full' ? '' : '[&>*]:pointer-events-auto'}`}
          >
            {floating}
          </motion.div>
        )}
        <div
          data-sheet-handle
          className="flex h-5 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-ink-faint/40" />
        </div>
        <div
          style={{ height: (dragging ? heights.full : heights[snap]) - 20 }}
          className="relative min-h-0 shrink-0 overflow-hidden"
        >
          {children}
        </div>
        <div aria-hidden className="absolute inset-x-0 top-full h-screen bg-surface" />
      </motion.div>
    </>
  );
}
