import { clearDraft } from '../drafts/storage';
import { useAutosave } from '../drafts/useAutosave';
import { isRouteDraft, type RouteDraft } from './model';
import { useBuilderStore } from './store';

const restoreInto = (draft: RouteDraft) => useBuilderStore.getState().restore(draft);

export function clearStoredDraft(routeId: number | null): void {
  clearDraft('route', routeId);
}

/** The route builder's work kept on this device (see `useAutosave`). */
export function useDraftAutosave(routeId: number | null) {
  const draft = useBuilderStore((state) => state.draft);
  const dirty = useBuilderStore((state) => state.dirty);
  return useAutosave({
    kind: 'route',
    id: routeId,
    draft,
    dirty,
    isDraft: isRouteDraft,
    apply: restoreInto,
  });
}
