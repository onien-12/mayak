import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { motion } from 'motion/react';

import { eventsApi, queryKeys, type EventDetail } from '@/shared/api';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { AnimatedNumber, Avatar, SPRING } from '@/shared/ui';

const MAX_AVATARS = 7;

/** Seats left with a filling bar, or simply who is going when there is no limit. */
export function Seats({ event }: { event: EventDetail }) {
  if (event.capacity === null) {
    if (event.participants_count === 0) return null;
    return (
      <p className="flex items-center gap-1.5 text-sm text-ink-soft">
        <Users size={15} aria-hidden />
        Идут: {pluralize(event.participants_count, PLURALS.participant)}
      </p>
    );
  }
  const share = Math.min(1, event.participants_count / Math.max(1, event.capacity));
  const left = event.seats_left ?? 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-ink-soft">
          Записались{' '}
          <AnimatedNumber value={event.participants_count} className="font-semibold text-ink" /> из{' '}
          {event.capacity}
        </span>
        <span className={left > 0 ? 'font-medium text-success-ink' : 'font-medium text-ink-soft'}>
          {left > 0 ? `Осталось ${pluralize(left, PLURALS.seat)}` : 'Мест нет'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/70">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(share, 0.03) }}
          transition={SPRING.soft}
          className="h-full origin-left rounded-full bg-event"
        />
      </div>
    </div>
  );
}

/** Avatars of the people who joined. */
export function Participants({ placeId, count }: { placeId: number; count: number }) {
  const participants = useQuery({
    queryKey: queryKeys.places.participants(placeId),
    queryFn: () => eventsApi.participants(placeId),
    enabled: count > 0,
  });
  const users = participants.data ?? [];
  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-2.5">
      <ul aria-label="Участники" className="flex -space-x-2">
        {users.slice(0, MAX_AVATARS).map((user) => (
          <li key={user.id} title={user.display_name}>
            <Avatar
              id={user.id}
              name={user.display_name}
              size={30}
              className="ring-2 ring-event-soft"
            />
          </li>
        ))}
      </ul>
      {users.length > MAX_AVATARS && (
        <span className="text-sm font-medium text-ink-soft">+{users.length - MAX_AVATARS}</span>
      )}
    </div>
  );
}
