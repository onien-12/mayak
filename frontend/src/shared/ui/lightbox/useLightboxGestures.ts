import { animate, useMotionValue, useMotionValueEvent, type MotionValue } from 'motion/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { SPRING } from '../motion';
import { clamp, distance, rubber, VelocityTracker, type Gesture, type Point } from './gestureMath';

/** Space between neighbouring photos on the track, px. */
export const SLIDE_GAP = 16;
const MAX_SCALE = 4;
const TAP_SCALE = 2.5;
const LOCK_PX = 8;
const SWIPE_PX = 70;
const DISMISS_PX = 110;
const FLICK_VELOCITY = 450;
const TAP_MS = 400;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 32;
const EDGE_RESISTANCE = 0.35;

interface Options {
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  reduced: boolean;
}

export interface LightboxMotion {
  track: MotionValue<number>;
  pull: MotionValue<number>;
  scale: MotionValue<number>;
  panX: MotionValue<number>;
  panY: MotionValue<number>;
}

/**
 * Every gesture of the photo viewer on one surface: swipe between photos (rubber band at the
 * ends), pull down to dismiss, tap outside the photo to close, pinch / double tap / wheel to
 * zoom around the fingers or the cursor, and pan the zoomed photo within its edges.
 */
export function useLightboxGestures({ index, count, onIndexChange, onClose, reduced }: Options) {
  const motion: LightboxMotion = {
    track: useMotionValue(0),
    pull: useMotionValue(0),
    scale: useMotionValue(1),
    panX: useMotionValue(0),
    panY: useMotionValue(0),
  };
  const { track, pull, scale, panX, panY } = motion;
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const image = useRef<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ kind: 'idle' });
  const tracker = useRef(new VelocityTracker());
  const lastTap = useRef<(Point & { at: number }) | null>(null);
  const placedWidth = useRef(0);
  const slot = width + SLIDE_GAP;

  useMotionValueEvent(scale, 'change', (value) => setZoomed(value > 1.01));
  const to = (value: MotionValue<number>, target: number) =>
    reduced ? value.set(target) : void animate(value, target, SPRING.sheet);

  useEffect(() => {
    if (!stage) return;
    const observer = new ResizeObserver(() => setWidth(stage.clientWidth));
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  useEffect(() => {
    if (!width) return;
    scale.set(1);
    panX.set(0);
    panY.set(0);
    pull.set(0);
    const target = -index * (width + SLIDE_GAP);
    if (placedWidth.current !== width || reduced) track.set(target);
    else void animate(track, target, SPRING.sheet);
    placedWidth.current = width;
  }, [index, width, reduced, track, pull, scale, panX, panY]);

  const centre = (): Point => {
    const rect = stage?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
  };
  const bounds = (value: number): Point => {
    const element = image.current;
    if (!element || !stage) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (element.offsetWidth * value - stage.clientWidth) / 2),
      y: Math.max(0, (element.offsetHeight * value - stage.clientHeight) / 2),
    };
  };
  /** Zoom to `value` keeping the photo point under `focus` (client coordinates) in place. */
  const zoomTo = (value: number, focus: Point = centre(), animated = true) => {
    const next = clamp(value, 1, MAX_SCALE);
    const c = centre();
    const current = scale.get();
    const anchor = {
      x: (focus.x - c.x - panX.get()) / current,
      y: (focus.y - c.y - panY.get()) / current,
    };
    const limit = bounds(next);
    const x = clamp(focus.x - c.x - next * anchor.x, -limit.x, limit.x);
    const y = clamp(focus.y - c.y - next * anchor.y, -limit.y, limit.y);
    if (!animated) {
      scale.set(next);
      panX.set(x);
      panY.set(y);
      return;
    }
    to(scale, next);
    to(panX, x);
    to(panY, y);
  };
  const settleZoom = (fling: Point = { x: 0, y: 0 }) => {
    const value = clamp(scale.get(), 1, MAX_SCALE);
    const limit = bounds(value);
    to(scale, value);
    to(panX, clamp(panX.get() + fling.x * 0.12, -limit.x, limit.x));
    to(panY, clamp(panY.get() + fling.y * 0.12, -limit.y, limit.y));
  };

  useEffect(() => {
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0025));
      zoomTo(scale.get() * factor, { x: event.clientX, y: event.clientY }, false);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  });

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    const c = centre();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const value = scale.get();
    gesture.current = {
      kind: 'pinch',
      distance: Math.max(1, distance(a, b)),
      scale: value,
      anchor: { x: (mid.x - c.x - panX.get()) / value, y: (mid.y - c.y - panY.get()) / value },
    };
    to(track, -index * slot);
    to(pull, 0);
  };

  const onTap = (point: Point, onImage: boolean) => {
    if (!onImage) return onClose();
    const previous = lastTap.current;
    const now = performance.now();
    if (
      previous &&
      now - previous.at < DOUBLE_TAP_MS &&
      distance(previous, point) < DOUBLE_TAP_PX
    ) {
      lastTap.current = null;
      zoomTo(scale.get() > 1.01 ? 1 : TAP_SCALE, point);
    } else lastTap.current = { ...point, at: now };
  };

  const move = (point: Point) => {
    const current = gesture.current;
    if (current.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const c = centre();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const value = clamp((current.scale * distance(a, b)) / current.distance, 0.85, MAX_SCALE);
      scale.set(value);
      panX.set(mid.x - c.x - value * current.anchor.x);
      panY.set(mid.y - c.y - value * current.anchor.y);
      return;
    }
    if (current.kind === 'idle') return;
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    if (current.kind === 'press') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return;
      const { start } = current;
      if (scale.get() > 1.01)
        gesture.current = { kind: 'pan', start, from: { x: panX.get(), y: panY.get() } };
      else
        gesture.current =
          Math.abs(dx) > Math.abs(dy) ? { kind: 'swipe', start } : { kind: 'pull', start };
      return move(point);
    }
    if (current.kind === 'swipe') {
      const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === count - 1);
      track.set(-index * slot + (atEdge ? dx * EDGE_RESISTANCE : dx));
    } else if (current.kind === 'pull') {
      pull.set(dy > 0 ? dy : dy * 0.25);
    } else {
      const limit = bounds(scale.get());
      panX.set(rubber(current.from.x + dx, limit.x));
      panY.set(rubber(current.from.y + dy, limit.y));
    }
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    const current = gesture.current;
    if (current.kind === 'pinch') {
      const [rest] = [...pointers.current.values()];
      tracker.current.reset();
      gesture.current = rest
        ? { kind: 'pan', start: rest, from: { x: panX.get(), y: panY.get() } }
        : { kind: 'idle' };
      if (!rest) settleZoom();
      return;
    }
    if (pointers.current.size > 0 || !point) return;
    gesture.current = { kind: 'idle' };
    const fling = tracker.current.velocity();
    const cancelled = event.type === 'pointercancel';
    if (current.kind === 'press' && !cancelled && performance.now() - current.at < TAP_MS) {
      onTap(point, current.onImage);
    } else if (current.kind === 'swipe') {
      const dx = point.x - current.start.x;
      const next =
        dx < -SWIPE_PX || fling.x < -FLICK_VELOCITY
          ? 1
          : dx > SWIPE_PX || fling.x > FLICK_VELOCITY
            ? -1
            : 0;
      const target = index + next;
      if (next !== 0 && !cancelled && target >= 0 && target < count) onIndexChange(target);
      else to(track, -index * slot);
    } else if (current.kind === 'pull') {
      const dy = point.y - current.start.y;
      if (!cancelled && (dy > DISMISS_PX || fling.y > FLICK_VELOCITY)) onClose();
      else to(pull, 0);
    } else if (current.kind === 'pan') settleZoom(cancelled ? undefined : fling);
  };

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      // A new first finger starts a new gesture: forget pointers whose end never arrived.
      if (event.isPrimary) pointers.current.clear();
      const point = { x: event.clientX, y: event.clientY };
      pointers.current.set(event.pointerId, point);
      if (pointers.current.size >= 2) return startPinch();
      tracker.current.reset();
      tracker.current.add(point);
      gesture.current = {
        kind: 'press',
        start: point,
        at: performance.now(),
        onImage: event.target === image.current,
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      const point = { x: event.clientX, y: event.clientY };
      pointers.current.set(event.pointerId, point);
      if (pointers.current.size === 1) tracker.current.add(point);
      move(point);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };

  return {
    stageRef: setStage,
    imageRef: image,
    handlers,
    motion,
    width,
    zoomed,
    zoomBy: (factor: number) => zoomTo(scale.get() * factor),
  };
}
