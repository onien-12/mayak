import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notificationsApi, queryKeys, type Notification, type UserMe } from '@/shared/api';

const PAGE = { limit: 30, offset: 0 };

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notifications.list(PAGE),
    queryFn: () => notificationsApi.list(PAGE),
    enabled,
    staleTime: 0,
  });
}

/** Marks notifications as read (all when called without ids) and syncs the unread counter. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids?: number[]) => notificationsApi.markRead(ids),
    onMutate: (ids) => {
      queryClient.setQueryData<Notification[]>(queryKeys.notifications.list(PAGE), (list) =>
        list?.map((item) => (!ids || ids.includes(item.id) ? { ...item, is_read: true } : item)),
      );
    },
    onSuccess: ({ unread }) => {
      queryClient.setQueryData<UserMe>(queryKeys.auth.me, (me) =>
        me ? { ...me, unread_notifications: unread } : me,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}
