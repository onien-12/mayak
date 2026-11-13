import type { Notification } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import { NOTIFICATION_FALLBACK_META, NOTIFICATION_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';

interface NotificationItemProps {
  notification: Notification;
  onSelect: (notification: Notification) => void;
}

export function NotificationItem({ notification, onSelect }: NotificationItemProps) {
  const meta = NOTIFICATION_KIND_META[notification.kind] ?? NOTIFICATION_FALLBACK_META;
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className={cn(
        'flex w-full gap-3 rounded-control p-2.5 text-left transition-colors hover:bg-canvas',
        !notification.is_read && 'bg-beam-soft/60 hover:bg-beam-soft',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl',
          TONES[meta.tone].soft,
        )}
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
            {notification.title}
          </span>
          {!notification.is_read && (
            <span
              aria-label="Не прочитано"
              className="mt-1.5 size-2 shrink-0 rounded-full bg-issue"
            />
          )}
        </span>
        {notification.body && (
          <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft">
            {notification.body}
          </span>
        )}
        <span className="mt-1 block text-xs text-ink-faint">
          {formatRelative(notification.created_at)}
        </span>
      </span>
    </button>
  );
}
