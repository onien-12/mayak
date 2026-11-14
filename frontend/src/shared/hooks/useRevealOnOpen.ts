import { useEffect, useRef } from 'react';

const GAP_PX = 4;

/**
 * Brings a block that has just opened into view. Its toggle sits in the fixed toolbar of a
 * panel while the block itself is at the top of the scrolling list — opened from the middle
 * of the list it would otherwise appear off-screen.
 */
export function useRevealOnOpen<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const block = ref.current;
    const scroller = block?.closest<HTMLElement>('[data-sheet-scroll]');
    if (!open || !block || !scroller) return;
    const offset = block.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (offset >= 0 && offset < scroller.clientHeight / 2) return;
    scroller.scrollTo({
      top: Math.max(0, scroller.scrollTop + offset - GAP_PX),
      behavior: 'smooth',
    });
  }, [open]);

  return ref;
}
