import type { MotionValue } from 'motion/react';
import { useEffect, useEffectEvent, type RefObject } from 'react';

import type { SheetSnap } from '@/shared/ui';

import { resolveSnap, rubberBand, type SheetHeights } from './sheet';

const INTERACTIVE =
  'button, a, input, select, textarea, [role="button"], [role="radio"], [role="tab"]';
const SLOP_PX = 5;
/**
 * A finger never taps without slipping a few pixels. From a control (and from the footer, which
 * has nothing to scroll) the sheet starts to move only after a clear swipe — otherwise a
 * slightly sloppy tap on «Опубликовать» would tug or even drop the sheet instead of pressing.
 */
const CONTROL_SLOP_PX = 12;

interface Gesture {
  startX: number;
  startY: number;
  startOffset: number;
  lastY: number;
  lastTime: number;
  /** px/ms, positive = finger moving down. */
  speed: number;
  /** `null` until the direction is known. */
  dragging: boolean | null;
  onHandle: boolean;
  scroller: HTMLElement | null;
  /** How far the finger may move before the gesture is read as a swipe. */
  slop: number;
}

interface SheetGestureOptions {
  /** Sheet offset from its full position, px (0 = full height). */
  offset: MotionValue<number>;
  heights: SheetHeights;
  snap: SheetSnap;
  onDragStart: () => void;
  /** Called on release with the snap to settle at and the release velocity (px/s, down = positive). */
  onRelease: (snap: SheetSnap, velocity: number) => void;
  onTap: () => void;
}

/**
 * Touch and mouse gestures of the bottom sheet:
 * - below full height a vertical swipe anywhere on the sheet drags it;
 * - at full height the content scrolls natively and a pull-down from the scroll top hands
 *   the gesture over to the sheet (scroll hand-off);
 * - the grip and any `[data-sheet-handle]` always drag; a tap on them raises a peeking sheet;
 * - rubber-band resistance beyond the first and last snap, velocity-based snapping.
 */
export function useSheetGestures(
  ref: RefObject<HTMLElement | null>,
  options: SheetGestureOptions,
): void {
  const begin = useEffectEvent(
    (target: EventTarget | null, x: number, y: number, time: number): Gesture | null => {
      if (!(target instanceof HTMLElement) || target.closest('[data-sheet-ignore]')) return null;
      return {
        startX: x,
        startY: y,
        startOffset: options.offset.get(),
        lastY: y,
        lastTime: time,
        speed: 0,
        dragging: null,
        onHandle: Boolean(target.closest('[data-sheet-handle]')) && !target.closest(INTERACTIVE),
        scroller: target.closest<HTMLElement>('[data-sheet-scroll]'),
        slop: target.closest(INTERACTIVE) ? CONTROL_SLOP_PX : SLOP_PX,
      };
    },
  );

  const decide = useEffectEvent((gesture: Gesture, dx: number, dy: number): boolean | null => {
    if (gesture.onHandle) return Math.abs(dy) > SLOP_PX ? true : null;
    const atFull = options.snap === 'full';
    const pullFromTop = atFull && dy > 0 && (gesture.scroller?.scrollTop ?? 0) <= 0;
    // Only a pull on the scrolled content itself is handed over at once (before the browser
    // starts an overscroll); everything else waits for the slop.
    const immediate = pullFromTop && gesture.scroller !== null && gesture.slop === SLOP_PX;
    if (Math.abs(dx) < gesture.slop && Math.abs(dy) < gesture.slop && !immediate) return null;
    if (Math.abs(dx) > Math.abs(dy)) return false;
    return atFull ? pullFromTop : true;
  });

  const move = useEffectEvent((gesture: Gesture, x: number, y: number, time: number): boolean => {
    if (gesture.dragging === null) {
      gesture.dragging = decide(gesture, x - gesture.startX, y - gesture.startY);
      if (gesture.dragging) {
        gesture.startY = y;
        gesture.startOffset = options.offset.get();
        options.onDragStart();
      }
    }
    if (!gesture.dragging) return false;

    const elapsed = Math.max(1, time - gesture.lastTime);
    gesture.speed = 0.6 * ((y - gesture.lastY) / elapsed) + 0.4 * gesture.speed;
    gesture.lastY = y;
    gesture.lastTime = time;

    const max = options.heights.full - options.heights.peek;
    options.offset.set(rubberBand(gesture.startOffset + (y - gesture.startY), 0, max));
    return true;
  });

  const end = useEffectEvent((gesture: Gesture, time: number) => {
    if (gesture.dragging) {
      const speed = time - gesture.lastTime > 80 ? 0 : gesture.speed;
      const height = options.heights.full - options.offset.get();
      options.onRelease(resolveSnap(height, -speed, options.heights), speed * 1000);
    } else if (gesture.dragging === null && gesture.onHandle) {
      options.onTap();
    }
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let gesture: Gesture | null = null;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      gesture =
        touch && event.touches.length === 1
          ? begin(event.target, touch.clientX, touch.clientY, event.timeStamp)
          : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!gesture || !touch) return;
      if (move(gesture, touch.clientX, touch.clientY, event.timeStamp) && event.cancelable)
        event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (gesture) end(gesture, event.timeStamp);
      gesture = null;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (gesture) move(gesture, event.clientX, event.clientY, event.timeStamp);
    };
    const onMouseUp = (event: MouseEvent) => {
      if (gesture) end(gesture, event.timeStamp);
      gesture = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    const onMouseDown = (event: MouseEvent) => {
      const started = begin(event.target, event.clientX, event.clientY, event.timeStamp);
      if (!started?.onHandle) return;
      gesture = started;
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    element.addEventListener('mousedown', onMouseDown);
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [ref]);
}
