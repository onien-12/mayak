/**
 * Drafts kept on this device for the route builder and the quest editor: one per builder —
 * `…:new` for something new, `…:<id>` for edits of an existing route or quest. Every write and
 * removal is announced, so the «Черновики» block and the builders' status lines stay in step
 * without a reload.
 */

export type DraftKind = 'route' | 'quest';

export interface StoredDraft<T> {
  draft: T;
  savedAt: string;
}

export interface LocalDraft {
  kind: DraftKind;
  /** The route or quest being edited; `null` for a new one. */
  id: number | null;
  draft: unknown;
  savedAt: string;
}

const PREFIX: Record<DraftKind, string> = {
  route: 'mayak:route-draft:',
  quest: 'mayak:quest-draft:',
};
const CHANGED = 'mayak:drafts-changed';

const keyOf = (kind: DraftKind, id: number | null) => `${PREFIX[kind]}${id ?? 'new'}`;

function announce(): void {
  window.dispatchEvent(new Event(CHANGED));
}

function parse(raw: string | null): StoredDraft<unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredDraft<unknown>>;
    if (typeof value.savedAt !== 'string' || typeof value.draft !== 'object' || !value.draft) {
      return null;
    }
    return { draft: value.draft, savedAt: value.savedAt };
  } catch {
    return null;
  }
}

export function readDraft<T>(
  kind: DraftKind,
  id: number | null,
  isDraft: (value: unknown) => value is T,
): StoredDraft<T> | null {
  try {
    const stored = parse(localStorage.getItem(keyOf(kind, id)));
    return stored && isDraft(stored.draft)
      ? { draft: stored.draft, savedAt: stored.savedAt }
      : null;
  } catch {
    return null;
  }
}

/** Saves the draft now; returns when it was saved, or `null` when the device refused. */
export function writeDraft<T>(kind: DraftKind, id: number | null, draft: T): string | null {
  const savedAt = new Date().toISOString();
  try {
    localStorage.setItem(keyOf(kind, id), JSON.stringify({ draft, savedAt }));
  } catch {
    return null;
  }
  announce();
  return savedAt;
}

export function clearDraft(kind: DraftKind, id: number | null): void {
  try {
    localStorage.removeItem(keyOf(kind, id));
  } catch {
    // Storage unavailable — nothing was kept.
  }
  announce();
}

/** Every draft of this kind on the device, newest first. */
export function listDrafts(kind: DraftKind): LocalDraft[] {
  const found: LocalDraft[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(PREFIX[kind])) continue;
      const suffix = key.slice(PREFIX[kind].length);
      const id = suffix === 'new' ? null : Number(suffix);
      if (id !== null && !(Number.isInteger(id) && id > 0)) continue;
      const stored = parse(localStorage.getItem(key));
      if (stored) found.push({ kind, id, draft: stored.draft, savedAt: stored.savedAt });
    }
  } catch {
    return [];
  }
  return found.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Calls `onChange` whenever drafts change here or in another tab. */
export function subscribeDrafts(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      Object.values(PREFIX).some((prefix) => event.key?.startsWith(prefix))
    ) {
      onChange();
    }
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
