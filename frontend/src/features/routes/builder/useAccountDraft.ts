import { useMutation, useQueryClient } from '@tanstack/react-query';

import { errorMessage, queryKeys, routesApi, type RouteVisibility } from '@/shared/api';
import { toast } from '@/shared/ui';

import type { AccountBlocker, AccountSave } from '../drafts/DraftStatus';
import { toRouteInput, validateDraft, visibleCount, type RouteDraft } from './model';
import { useBuilderStore } from './store';

export const ACCOUNT_DRAFT_SAVED = 'Черновик сохранён в аккаунт — он в разделе «Маршруты»';

function blockerOf(draft: RouteDraft): AccountBlocker | null {
  const missing = 2 - visibleCount(draft.stops);
  if (missing === 2) return { text: 'добавьте две точки — старт и финиш' };
  if (missing === 1) return { text: 'добавьте ещё одну точку' };
  if (validateDraft(draft).title) {
    return {
      text: 'назовите маршрут',
      fix: {
        label: 'Назвать',
        run: () => {
          const store = useBuilderStore.getState();
          store.setStep('details');
          store.setErrors({ title: 'Назовите маршрут — хотя бы 3 символа' });
        },
      },
    };
  }
  return null;
}

interface AccountDraftOptions {
  routeId: number | null;
  /** Visibility of the route as saved; `null` for a new one. */
  saved: RouteVisibility | null;
  /** The device copy is no longer needed. */
  onStored: () => void;
  /** A new route became an account draft: continue editing it there. */
  onCreated: (routeId: number) => void;
}

/**
 * «Сохранить черновик в аккаунт»: the route as a private one, visible only to its author. Offered
 * for a new route and for an author's private one — a published route is kept by its own save.
 */
export function useAccountDraft({
  routeId,
  saved,
  onStored,
  onCreated,
}: AccountDraftOptions): AccountSave | null {
  const queryClient = useQueryClient();
  const draft = useBuilderStore((state) => state.draft);
  const save = useMutation({
    mutationFn: () => {
      const input = { ...toRouteInput(draft), visibility: 'private' as const };
      return routeId === null ? routesApi.create(input) : routesApi.update(routeId, input);
    },
    onSuccess: (route) => {
      useBuilderStore.getState().markSaved();
      onStored();
      // The builder of an edited route keeps its session: its own query is left alone.
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.mine });
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.lists });
      toast.success(ACCOUNT_DRAFT_SAVED);
      if (routeId === null) {
        queryClient.setQueryData(queryKeys.routes.detail(route.id), route);
        onCreated(route.id);
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (saved === 'public') return null;
  return { blocker: blockerOf(draft), saving: save.isPending, onSave: () => save.mutate() };
}
