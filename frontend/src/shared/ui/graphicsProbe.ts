import { hardwareHint, useGraphicsStore } from './graphics';

/*
 * Runtime confirmation of the automatic graphics tier. While `auto` has no verdict yet,
 * frame times are sampled — only during interactions (a tap, a drag, the wheel and the second
 * after it: panning the map, opening cards, dragging the sheet; typing is left out, it rarely
 * animates anything), so an idle page costs nothing — and grouped into windows of
 * `WINDOW_FRAMES`. The verdict is remembered
 * (see `graphics.ts`) and the probe stops; within a visit the tier only goes `full` → `lite`.
 */

/** Ignore the start-up: the first tiles and the first render are slow on every device. */
const WARMUP_MS = 4000;
/** Frames keep being sampled for this long after the last input event. */
const ACTIVE_TAIL_MS = 1000;
/** Gaps longer than this are a hidden tab or a breakpoint, not a frame. */
const MAX_FRAME_MS = 1000;
/** One window ≈ 1.5–3 s of interaction. */
const WINDOW_FRAMES = 90;
/** A frame slower than this (below 20 fps) is a visible stutter. */
const SLOW_FRAME_MS = 50;
/**
 * Slow window: the median frame is longer than 28 ms (under ~36 fps) or at least 20 % of
 * the frames stutter. Good window: the median fits 20 ms (50+ fps) and under 5 % stutter.
 */
const SLOW_MEDIAN_MS = 28;
const SLOW_SHARE = 0.2;
const GOOD_MEDIAN_MS = 20;
const GOOD_SHARE = 0.05;
/** Slow windows needed for `lite` — one when a weak hardware hint agrees, two otherwise. */
const SLOW_WINDOWS_TO_LITE = { weak: 1, none: 2 } as const;
/** Good windows needed to settle on `full`. */
const GOOD_WINDOWS_TO_FULL = 3;
/** Mixed results: after this many windows the device is good enough — `full`. */
const MAX_WINDOWS = 8;

type Window = 'slow' | 'good' | 'mixed';

function classify(deltas: number[]): Window {
  const sorted = deltas.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const slowShare = deltas.filter((delta) => delta > SLOW_FRAME_MS).length / deltas.length;
  if (median > SLOW_MEDIAN_MS || slowShare >= SLOW_SHARE) return 'slow';
  if (median <= GOOD_MEDIAN_MS && slowShare < GOOD_SHARE) return 'good';
  return 'mixed';
}

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'touchmove'] as const;

/** Samples one evaluation run; returns the stop function. */
function runProbe(): () => void {
  const hint = hardwareHint();
  const slowNeeded = SLOW_WINDOWS_TO_LITE[hint === 'weak' ? 'weak' : 'none'];
  const startedAt = performance.now();
  let activeUntil = 0;
  let frame = 0;
  let lastFrame = 0;
  let deltas: number[] = [];
  let slow = 0;
  let good = 0;
  let windows = 0;

  const finish = (tier: 'full' | 'lite') => {
    stop();
    useGraphicsStore.getState().setVerdict({ tier, reason: 'frames', at: Date.now() });
  };

  const onFrame = (now: number) => {
    frame = 0;
    if (lastFrame !== 0 && !document.hidden) {
      const delta = now - lastFrame;
      if (delta < MAX_FRAME_MS) deltas.push(delta);
    }
    lastFrame = now;
    if (deltas.length >= WINDOW_FRAMES) {
      const result = classify(deltas);
      deltas = [];
      windows += 1;
      if (result === 'slow') slow += 1;
      if (result === 'good') good += 1;
      if (slow >= slowNeeded) return finish('lite');
      if (good >= GOOD_WINDOWS_TO_FULL || windows >= MAX_WINDOWS) return finish('full');
    }
    if (now < activeUntil) frame = requestAnimationFrame(onFrame);
    else lastFrame = 0;
  };

  const onInput = (event: Event) => {
    // A mouse merely hovering is not an interaction; a drag (button held) is.
    if (event instanceof PointerEvent && event.type === 'pointermove' && event.buttons === 0)
      return;
    const now = performance.now();
    if (now - startedAt < WARMUP_MS) return;
    activeUntil = now + ACTIVE_TAIL_MS;
    if (frame === 0) frame = requestAnimationFrame(onFrame);
  };

  const options = { capture: true, passive: true } as const;
  for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, options);

  function stop() {
    for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, options);
    cancelAnimationFrame(frame);
    frame = 0;
  }
  return stop;
}

/**
 * Starts the frame-time probe whenever the automatic tier has no verdict (first visit,
 * an expired verdict, or «Авто» picked again in the settings). Call once at start-up.
 */
export function startGraphicsProbe(): void {
  let stop: (() => void) | null = null;
  const sync = () => {
    const { choice, verdict } = useGraphicsStore.getState();
    const needed = choice === 'auto' && verdict === null;
    if (needed && !stop) stop = runProbe();
    if (!needed && stop) {
      stop();
      stop = null;
    }
  };
  sync();
  useGraphicsStore.subscribe(sync);
}
