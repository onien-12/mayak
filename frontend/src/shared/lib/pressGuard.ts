const GUARD_MS = 450;
let lastHandledAt = 0;

/**
 * Records that a press has just been consumed by something floating above the map — an
 * outside press that closed a popover, a click on a map dot, etc.
 */
export function markPressHandled(): void {
  lastHandledAt = performance.now();
}

/**
 * True right after `markPressHandled()` — the same press must not also be treated as a
 * new action on whatever is underneath (e.g. a tap on the base map).
 */
export function wasPressJustHandled(): boolean {
  return performance.now() - lastHandledAt < GUARD_MS;
}
