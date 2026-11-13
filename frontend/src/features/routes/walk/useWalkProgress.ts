import { useCallback, useState } from 'react';

interface WalkProgress {
  /** Index of the stop the walker is at (among numbered stops). */
  index: number;
  finished: boolean;
}

const START: WalkProgress = { index: 0, finished: false };
const storageKey = (routeId: number) => `mayak:walk:${routeId}`;

function read(routeId: number, total: number): WalkProgress {
  try {
    const raw = localStorage.getItem(storageKey(routeId));
    if (!raw) return START;
    const saved = JSON.parse(raw) as Partial<WalkProgress>;
    const index = typeof saved.index === 'number' ? saved.index : 0;
    return {
      index: Math.min(Math.max(0, index), Math.max(0, total - 1)),
      finished: saved.finished === true,
    };
  } catch {
    return START;
  }
}

function write(routeId: number, progress: WalkProgress): void {
  try {
    localStorage.setItem(storageKey(routeId), JSON.stringify(progress));
  } catch {
    // Private mode / full storage: the walk still works, it just will not resume after reload.
  }
}

/** Position in the «Пройти маршрут» stepper, kept per route on the device so a reload resumes. */
export function useWalkProgress(routeId: number, total: number) {
  const [progress, setProgress] = useState(() => read(routeId, total));

  const update = useCallback(
    (next: WalkProgress) => {
      setProgress(next);
      write(routeId, next);
    },
    [routeId],
  );

  return {
    ...progress,
    goTo: (index: number) =>
      update({ index: Math.min(Math.max(0, index), total - 1), finished: false }),
    finish: () => update({ index: total - 1, finished: true }),
    restart: () => update(START),
  };
}
