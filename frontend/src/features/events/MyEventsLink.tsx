import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import { useAuth } from '@/features/auth';
import { queryKeys, usersApi } from '@/shared/api';

/**
 * One quiet line to «Мои события» in the profile — only for a signed-in person who has upcoming
 * events of their own (organised or joined). The events themselves live in the profile.
 */
export function MyEventsLink() {
  const { isAuthenticated } = useAuth();
  const mine = useQuery({
    queryKey: queryKeys.me.events,
    queryFn: () => usersApi.myEvents(),
    enabled: isAuthenticated,
  });
  const count = mine.data?.length ?? 0;
  if (!isAuthenticated || count === 0) return null;

  return (
    <Link
      to={{ pathname: '/profile', search: '?tab=events' }}
      className="-my-1 flex min-h-9 items-center gap-2 self-start text-sm text-ink-soft hover:text-ink"
    >
      <CalendarCheck size={16} aria-hidden className="text-event-ink" />
      <span className="tabular-nums">{`Мои события · ${count}`}</span>
      <ChevronRight size={15} aria-hidden className="text-ink-faint" />
    </Link>
  );
}
