import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useAuth } from '@/features/auth';
import type { Notification } from '@/shared/api';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Popover,
  Skeleton,
  type IconButtonProps,
  type PopoverPlacement,
} from '@/shared/ui';

import { NotificationItem } from './NotificationItem';
import { useMarkNotificationsRead, useNotifications } from './useNotifications';

interface NotificationBellProps {
  placement?: PopoverPlacement;
  variant?: IconButtonProps['variant'];
}

/** Bell with the unread counter and a dropdown list. Renders nothing for anonymous users. */
export function NotificationBell({
  placement = 'bottom-end',
  variant = 'ghost',
}: NotificationBellProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications(open && user !== null);
  const markRead = useMarkNotificationsRead();

  if (!user) return null;
  const unread = user.unread_notifications;

  const select = (notification: Notification) => {
    if (!notification.is_read) markRead.mutate([notification.id]);
    setOpen(false);
    if (notification.link) navigate(notification.link);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      label="Уведомления"
      className="flex w-[min(380px,calc(100vw-16px))] flex-col"
      trigger={(props) => (
        <span className="relative inline-flex">
          <IconButton
            {...props}
            icon={Bell}
            size="lg"
            variant={variant}
            label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'}
          />
          {unread > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-issue px-1 text-2xs leading-none font-bold text-white"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
      )}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface px-4 pt-3.5 pb-2">
        <h2 className="font-display text-base font-semibold text-ink">Уведомления</h2>
        {unread > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={CheckCheck}
            onClick={() => markRead.mutate(undefined)}
          >
            Прочитать все
          </Button>
        )}
      </header>
      <div className="flex flex-col gap-0.5 px-1.5 pb-2">
        {notifications.isPending &&
          Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex gap-3 p-2.5">
              <Skeleton className="size-9 rounded-xl" />
              <div className="flex-1 space-y-2 py-0.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        {notifications.isError && (
          <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
        )}
        {notifications.data?.length === 0 && (
          <EmptyState
            icon={BellOff}
            title="Пока тихо"
            description="Здесь появятся ответы на ваши публикации, изменения событий и новости рядом с вами."
          />
        )}
        {notifications.data?.map((item) => (
          <NotificationItem key={item.id} notification={item} onSelect={select} />
        ))}
      </div>
    </Popover>
  );
}
