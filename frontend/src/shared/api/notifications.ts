import { api } from './client';
import type { Notification, PageParams } from './types';

export const notificationsApi = {
  list: (page: PageParams = { limit: 30, offset: 0 }) =>
    api.get<Notification[]>('/notifications', { ...page }),
  /** Marks the given notifications (or all when `ids` is omitted) as read. */
  markRead: (ids?: number[]) => api.post<{ unread: number }>('/notifications/read', { ids }),
};
