import { useCallback, useEffect, useRef, useState } from 'react';

import { clearDraft, readDraft, writeDraft, type DraftKind, type StoredDraft } from './storage';

const SAVE_DELAY_MS = 600;

export interface DeviceSave {
  /** When the work on screen was last written to this device; `null` before the first write. */
  savedAt: string | null;
  /** The device refused to store it (private mode, full storage). */
  failed: boolean;
}

interface AutosaveOptions<T> {
  kind: DraftKind;
  id: number | null;
  draft: T;
  dirty: boolean;
  isDraft: (value: unknown) => value is T;
  /** Puts a stored draft into the builder. */
  apply: (draft: T) => void;
}

/**
 * Keeps unsaved work of a builder on this device: written shortly after every change and at once
 * before leaving the page, offered back when the same builder opens again (or restored right
 * away from «Черновики»), removed after it is saved to the account.
 */
export function useAutosave<T>({ kind, id, draft, dirty, isDraft, apply }: AutosaveOptions<T>) {
  const [stored, setStored] = useState(() => readDraft(kind, id, isDraft));
  const [device, setDevice] = useState<DeviceSave>({ savedAt: null, failed: false });
  const latest = useRef({ draft, dirty });

  useEffect(() => {
    latest.current = { draft, dirty };
  }, [draft, dirty]);

  const write = useCallback(() => {
    if (!latest.current.dirty) return;
    const savedAt = writeDraft(kind, id, latest.current.draft);
    setDevice({ savedAt, failed: savedAt === null });
  }, [kind, id]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(write, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, write]);

  // Closing the tab or reloading: the last keystrokes are written too.
  useEffect(() => {
    const onHide = () => {
      if (latest.current.dirty) write();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [write]);

  /** Writes now (before leaving); `device.failed` tells whether the device took it. */
  const flush = write;

  const restore = useCallback((): T | null => {
    if (!stored) return null;
    apply(stored.draft);
    setDevice({ savedAt: stored.savedAt, failed: false });
    setStored(null);
    return stored.draft;
  }, [stored, apply]);

  const discard = useCallback(() => {
    clearDraft(kind, id);
    setStored(null);
  }, [kind, id]);

  /** The work was saved to the account: the device copy is no longer needed. */
  const clear = useCallback(() => {
    clearDraft(kind, id);
    setStored(null);
    setDevice({ savedAt: null, failed: false });
  }, [kind, id]);

  return { stored, restore, discard, clear, flush, device };
}

export type Autosave<T> = ReturnType<typeof useAutosave<T>>;
export type { StoredDraft };
