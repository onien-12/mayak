import { useCallback, useEffect, useState } from 'react';

import type { QuestDraft } from './model';
import { useQuestEditorStore } from './store';

const SAVE_DELAY_MS = 600;

export interface StoredQuestDraft {
  draft: QuestDraft;
  savedAt: string;
}

const storageKey = (questId: number | null) => `mayak:quest-draft:${questId ?? 'new'}`;

function readDraft(questId: number | null): StoredQuestDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(questId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredQuestDraft;
    return Array.isArray(stored.draft?.stages) ? stored : null;
  } catch {
    return null;
  }
}

export function clearStoredQuestDraft(questId: number | null): void {
  try {
    localStorage.removeItem(storageKey(questId));
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

/**
 * Keeps the editor's unsaved work on this device, as the route builder does: written shortly
 * after every change, offered back when the same editor opens again, removed after saving.
 */
export function useQuestDraftAutosave(questId: number | null) {
  const [stored, setStored] = useState(() => readDraft(questId));
  const draft = useQuestEditorStore((state) => state.draft);
  const dirty = useQuestEditorStore((state) => state.dirty);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      try {
        const value: StoredQuestDraft = { draft, savedAt: new Date().toISOString() };
        localStorage.setItem(storageKey(questId), JSON.stringify(value));
      } catch {
        // Full or disabled storage: the editor keeps working without autosave.
      }
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, questId]);

  const restore = useCallback((): QuestDraft | null => {
    if (!stored) return null;
    useQuestEditorStore.getState().restore(stored.draft);
    setStored(null);
    return stored.draft;
  }, [stored]);

  const discard = useCallback(() => {
    clearStoredQuestDraft(questId);
    setStored(null);
  }, [questId]);

  return { stored, restore, discard };
}
