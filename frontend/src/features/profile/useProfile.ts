import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  errorMessage,
  queryKeys,
  usersApi,
  type Subscription,
  type SubscriptionInput,
  type UserMe,
  type UserProfile,
  type UserUpdate,
} from '@/shared/api';
import { toast } from '@/shared/ui';

const NOT_FOUND = 404;
/** Reputation the receiver gets for a respect (SPEC §4). */
export const RESPECT_REWARD = 3;

export function useProfile(id: number | null) {
  return useQuery({
    queryKey: queryKeys.users.profile(id ?? 0),
    queryFn: () => usersApi.profile(id ?? 0),
    enabled: id !== null,
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === NOT_FOUND) && count < 1,
  });
}

/** Friendly explanation of a refused respect (SPEC §4: once per pair, residents+, 5 a day). */
function respectRefusal(error: unknown): string {
  if (!(error instanceof ApiError)) return errorMessage(error);
  if (error.status === 409) return 'Вы уже отправляли респект этому жителю — он его получил';
  if (error.status === 403)
    return 'Респекты можно отправлять с уровня «Житель» — наберите 10 баллов репутации';
  if (error.status === 429) return 'Сегодня вы отправили 5 респектов — завтра можно снова';
  return error.detail;
}

/** Optimistic respect: the button fills and the reputation ticks up right away. */
export function useRespect(id: number) {
  const queryClient = useQueryClient();
  const key = queryKeys.users.profile(id);

  return useMutation({
    mutationFn: () => usersApi.respect(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserProfile>(key);
      if (previous) {
        queryClient.setQueryData<UserProfile>(key, {
          ...previous,
          respected_by_me: true,
          reputation: previous.reputation + RESPECT_REWARD,
          stats: { ...previous.stats, respects_received: previous.stats.respects_received + 1 },
        });
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      const already = error instanceof ApiError && error.status === 409;
      if (context?.previous) {
        queryClient.setQueryData<UserProfile>(
          key,
          already ? { ...context.previous, respected_by_me: true } : context.previous,
        );
      }
      if (already) toast.info(respectRefusal(error));
      else toast.error(respectRefusal(error));
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(key, profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success(`Респект отправлен: +${RESPECT_REWARD} к репутации — ${profile.display_name}`);
    },
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserUpdate) => usersApi.updateMe(input),
    onSuccess: (me: UserMe) => {
      queryClient.setQueryData(queryKeys.auth.me, me);
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(me.id) });
      toast.success('Профиль обновлён');
    },
  });
}

export const SUBSCRIPTIONS_MAX = 10;

export function useSubscriptions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.me.subscriptions,
    queryFn: usersApi.subscriptions,
    enabled,
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubscriptionInput) => usersApi.createSubscription(input),
    onSuccess: (subscription) => {
      queryClient.setQueryData<Subscription[]>(queryKeys.me.subscriptions, (list = []) => [
        subscription,
        ...list,
      ]);
      toast.success('Подписка создана — сообщим о новых местах в этом районе');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  const key = queryKeys.me.subscriptions;
  return useMutation({
    mutationFn: (id: number) => usersApi.deleteSubscription(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Subscription[]>(key);
      queryClient.setQueryData<Subscription[]>(key, (list = []) =>
        list.filter((item) => item.id !== id),
      );
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: () => toast.success('Подписка удалена'),
  });
}
