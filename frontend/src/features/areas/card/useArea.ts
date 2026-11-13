import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { usePersonalization } from '@/features/interests';
import { ApiError, areasApi, errorMessage, queryKeys, type AreaDetail } from '@/shared/api';
import { toast } from '@/shared/ui';

const NOT_FOUND = 404;

/** The area card; `personal_interest` follows the viewer's profile (refetched when it changes). */
export function useArea(areaId: number) {
  const { topics, ready } = usePersonalization();
  return useQuery({
    queryKey: queryKeys.areas.detail(areaId),
    queryFn: () => areasApi.get(areaId, topics),
    enabled: ready,
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === NOT_FOUND) && count < 1,
  });
}

/** Stores a fresh `AreaDetail` and refreshes everything derived from it (lists, places). */
export function syncArea(queryClient: QueryClient, area: AreaDetail): void {
  queryClient.setQueryData(queryKeys.areas.detail(area.id), area);
  void queryClient.invalidateQueries({ queryKey: queryKeys.areas.lists });
  void queryClient.invalidateQueries({ queryKey: queryKeys.places.lists });
}

/** Moderator-only delete: the places inside are detached, not deleted. */
export function useDeleteArea(areaId: number, onDeleted: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => areasApi.remove(areaId),
    onSuccess: () => {
      toast.success('Локация удалена, места остались на карте');
      onDeleted();
      queryClient.removeQueries({ queryKey: queryKeys.areas.detail(areaId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.areas.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
