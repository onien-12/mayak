import type { Layer, Photo } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

import type { PlaceFormValues } from './placeForm';

const STORAGE_KEY = 'mayak-place-draft';
/** An older draft is about something else by now. */
const MAX_AGE_MS = 12 * 3_600_000;

/** What the author has typed into the last step, kept until it is published or cleared. */
export interface FormDraft {
  /** `new:<layer>` for a publication being created, `edit:<place id>` for an edit. */
  scope: string;
  /** What the values were typed for: another category has other attributes, another point another address. */
  categoryId: number;
  point: LatLng;
  values: PlaceFormValues;
  photos: Photo[];
  savedAt: number;
}

export const draftScope = (layer: Layer, editingId: number | undefined): string =>
  editingId === undefined ? `new:${layer}` : `edit:${editingId}`;

/** Edits of an existing place live only while its editor is open; new publications survive a reload. */
const isStored = (scope: string) => scope.startsWith('new:');

let memory: FormDraft | null = null;

function readStorage(): FormDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FormDraft) : null;
  } catch {
    return null;
  }
}

/** The draft of this scope, if there is a fresh one. */
export function readDraft(scope: string): FormDraft | null {
  const draft = memory?.scope === scope ? memory : isStored(scope) ? readStorage() : null;
  if (!draft || draft.scope !== scope || Date.now() - draft.savedAt > MAX_AGE_MS) return null;
  return draft;
}

export function writeDraft(draft: Omit<FormDraft, 'savedAt'>): void {
  const { scope } = draft;
  memory = { ...draft, savedAt: Date.now() };
  if (!isStored(scope)) return;
  // An untouched form is not a draft — and must not replace the stored one of another layer.
  if (!hasContent(memory)) return clearDraft(scope);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage is unavailable (private window, quota): the draft lives until the tab closes.
  }
}

export function clearDraft(scope: string): void {
  if (memory?.scope === scope) memory = null;
  if (!isStored(scope)) return;
  try {
    if (readStorage()?.scope === scope) localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
}

/** Unsaved edits of a place do not outlive its editor: called when an editor opens. */
export function forgetEditDrafts(): void {
  if (memory && !isStored(memory.scope)) memory = null;
}

/** Something worth restoring: text or photos, not just the untouched defaults. */
export function hasContent(draft: FormDraft): boolean {
  const { title, description, tips } = draft.values;
  return Boolean(title.trim() || description.trim() || tips.trim() || draft.photos.length > 0);
}
