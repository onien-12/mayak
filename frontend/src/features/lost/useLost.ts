import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  errorMessage,
  lostApi,
  queryKeys,
  rereadAfterCheck,
  type LostItem,
  type LostItemInput,
  type LostSearchQuery,
} from '@/shared/api';
import { toast } from '@/shared/ui';

import { toLostQuery, useLostFilters } from './filtersStore';

/** Inline message for a failed form: the field message of a 422, else the backend detail. */
export function lostErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.errors[0]?.message ?? error.detail;
  return errorMessage(error);
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** Active posts under the current filters — the list and the map pins. */
export function useLostList() {
  const kind = useLostFilters((state) => state.kind);
  const categories = useLostFilters((state) => state.categories);
  const period = useLostFilters((state) => state.period);
  const query = toLostQuery({ kind, categories, period });
  return useQuery({
    queryKey: queryKeys.lost.list(query),
    queryFn: ({ signal }) => lostApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useMyLostItems(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.lost.mine, queryFn: lostApi.mine, enabled });
}

export function useLostItem(id: number) {
  return useQuery({
    queryKey: queryKeys.lost.detail(id),
    queryFn: () => lostApi.get(id),
    enabled: Number.isFinite(id),
    retry: (count, error) => !isNotFound(error) && count < 2,
  });
}

/** «Похожие находки» of a lost post; «Возможно, это ищут» of a found one — its author only. */
export function useLostMatches(item: LostItem | undefined) {
  const allowed = item !== undefined && (item.kind === 'lost' || item.is_mine || item.can_moderate);
  return useQuery({
    queryKey: queryKeys.lost.matches(item?.id ?? 0),
    queryFn: () => lostApi.matches(item?.id ?? 0),
    enabled: allowed && item?.state === 'active',
  });
}

export function useLostResponses(item: LostItem | undefined) {
  return useQuery({
    queryKey: queryKeys.lost.responses(item?.id ?? 0),
    queryFn: () => lostApi.responses(item?.id ?? 0),
    enabled: item?.is_mine === true,
  });
}

/** The plain search over found posts; works before anything is published and without an account. */
export function useLostSearch(query: LostSearchQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.lost.search(query),
    queryFn: ({ signal }) => lostApi.search(query, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}

function useRefreshLost() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.lost.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };
}

export function useCreateLostItem() {
  const refresh = useRefreshLost();
  return useMutation({
    mutationFn: (input: LostItemInput) => lostApi.create(input),
    onSuccess: (item) => {
      refresh();
      rereadAfterCheck([queryKeys.lost.all]);
      toast.success(
        item.kind === 'lost'
          ? 'Объявление опубликовано. Сообщим, если найдётся похожее.'
          : 'Объявление опубликовано. Спасибо, что не прошли мимо!',
      );
    },
  });
}

/** Close, delete, report, hide — one-click actions on a post. */
export function useLostItemAction<T>(action: (id: number) => Promise<T>, done: string) {
  const refresh = useRefreshLost();
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      refresh();
      toast.success(done);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useRespond(itemId: number) {
  const refresh = useRefreshLost();
  return useMutation({
    mutationFn: (input: { message: string; contact: string }) => lostApi.respond(itemId, input),
    onSuccess: () => {
      refresh();
      rereadAfterCheck([queryKeys.lost.detail(itemId)]);
      toast.success('Отклик отправлен автору. Ответ придёт в уведомления.');
    },
  });
}

export function useDecideResponse() {
  const refresh = useRefreshLost();
  return useMutation({
    mutationFn: ({ id, contact }: { id: number; contact: string | null }) =>
      contact === null ? lostApi.decline(id) : lostApi.accept(id, contact),
    onSuccess: (response) => {
      refresh();
      toast.success(
        response.state === 'accepted'
          ? 'Контакты открыты — свяжитесь друг с другом.'
          : 'Отклик отклонён, человек получит уведомление.',
      );
    },
  });
}
