import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  errorMessage,
  queryKeys,
  routesApi,
  type ReviewInput,
  type RouteDetail,
} from '@/shared/api';
import { toast } from '@/shared/ui';

const NOT_FOUND = 404;

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === NOT_FOUND;
}

export function useRoute(id: number) {
  return useQuery({
    queryKey: queryKeys.routes.detail(id),
    queryFn: () => routesApi.get(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: (count, error) => !isNotFound(error) && count < 1,
  });
}

/** Route id from the `:id` URL segment (`NaN` when malformed). */
export function parseRouteId(raw: string | undefined): number {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

/** «Сохранить себе»: optimistic heart with the counter, rollback on failure. */
export function useSaveRoute(id: number) {
  const queryClient = useQueryClient();
  const key = queryKeys.routes.detail(id);

  return useMutation({
    mutationFn: (save: boolean) => (save ? routesApi.save(id) : routesApi.unsave(id)),
    onMutate: async (save) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<RouteDetail>(key);
      if (previous) {
        queryClient.setQueryData<RouteDetail>(key, {
          ...previous,
          is_saved: save,
          saves_count: Math.max(0, previous.saves_count + (save ? 1 : -1)),
        });
      }
      return { previous };
    },
    onError: (error, _save, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: (_data, save) => {
      if (save) toast.success('Маршрут сохранён — он в «Избранном»');
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.favorites });
    },
  });
}

export function useDeleteRoute(id: number, onDeleted: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => routesApi.remove(id),
    onSuccess: () => {
      toast.success('Маршрут удалён');
      queryClient.removeQueries({ queryKey: queryKeys.routes.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.all });
      onDeleted();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useRouteReviews(id: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.routes.reviews(id),
    queryFn: () => routesApi.reviews(id),
    enabled,
  });
}

export function useSaveRouteReview(id: number, updating: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => routesApi.saveReview(id, input),
    onSuccess: () => {
      toast.success(updating ? 'Отзыв обновлён' : 'Спасибо за отзыв!');
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.reviews(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.routes.lists });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
