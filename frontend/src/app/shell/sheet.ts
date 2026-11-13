import type { SheetSnap } from '@/shared/ui';

import { SHEET_HALF_RATIO, SHEET_PEEK, SHEET_TOP_GAP, TAB_BAR_HEIGHT } from './layout';

export type SheetHeights = Record<SheetSnap, number>;

const ORDER: readonly SheetSnap[] = ['peek', 'half', 'full'];
/** Release speed (px/ms) above which the sheet follows the fling instead of the nearest snap. */
const FLING_SPEED = 0.45;
const RUBBER_FACTOR = 0.28;

/** Visible sheet height in px for every snap point. */
export function sheetHeights(windowHeight: number, peekOverride: number | null): SheetHeights {
  const available = windowHeight - TAB_BAR_HEIGHT;
  const full = available - SHEET_TOP_GAP;
  const peek = Math.min(peekOverride ?? SHEET_PEEK, full);
  return { peek, half: Math.max(peek, Math.round(available * SHEET_HALF_RATIO)), full };
}

/**
 * Snap point for a released sheet.
 * @param height Visible height at release.
 * @param speed Release speed in px/ms, positive = moving up.
 */
export function resolveSnap(height: number, speed: number, heights: SheetHeights): SheetSnap {
  const nearest = ORDER.reduce((best, snap) =>
    Math.abs(heights[snap] - height) < Math.abs(heights[best] - height) ? snap : best,
  );
  if (Math.abs(speed) < FLING_SPEED) return nearest;
  if (speed > 0) return ORDER.find((snap) => heights[snap] > height + 1) ?? 'full';
  return ORDER.findLast((snap) => heights[snap] < height - 1) ?? 'peek';
}

/** Resistance beyond the allowed range: the sheet follows the finger at a fraction of the distance. */
export function rubberBand(value: number, min: number, max: number): number {
  if (value < min) return min - (min - value) * RUBBER_FACTOR;
  if (value > max) return max + (value - max) * RUBBER_FACTOR;
  return value;
}
