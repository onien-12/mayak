import { useCallback, useEffect, useState } from 'react';

import type { RouteDraft } from './model';
import { useBuilderStore } from './store';

const SAVE_DELAY_MS = 600;

export interface StoredDraft {
  draft: RouteDraft;
  savedAt: string;
}

const storageKey = (routeId: number | null) => `mayak:route-draft:${routeId ?? 'new'}`;

function readDraft(routeId: number | null): StoredDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(routeId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDraft;
    return Array.isArray(stored.draft?.stops) ? stored : null;
  } catch {
    return null;
  }
}

export function clearStoredDraft(routeId: number | null): void {
  try {
    localStorage.removeItem(storageKey(routeId));
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

/**
 * Keeps the builder's unsaved work on this device: written shortly after every change,
 * offered back (`stored`) when the same builder is opened again, removed after saving.
 */
export function useDraftAutosave(routeId: number | null) {
  const [stored, setStored] = useState(() => readDraft(routeId));
  const draft = useBuilderStore((state) => state.draft);
  const dirty = useBuilderStore((state) => state.dirty);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      try {
        const value: StoredDraft = { draft, savedAt: new Date().toISOString() };
        localStorage.setItem(storageKey(routeId), JSON.stringify(value));
      } catch {
        // Full or disabled storage: the builder keeps working without autosave.
      }
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, routeId]);

  /** Continues the stored draft; returns it so the caller can frame it on the map. */
  const restore = useCallback((): RouteDraft | null => {
    if (!stored) return null;
    useBuilderStore.getState().restore(stored.draft);
    setStored(null);
    return stored.draft;
  }, [stored]);

  const discard = useCallback(() => {
    clearStoredDraft(routeId);
    setStored(null);
  }, [routeId]);

  return { stored, restore, discard };
}
