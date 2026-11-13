import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { motion } from 'motion/react';

import { eventsApi, queryKeys, type EventDetail } from '@/shared/api';
import type { EventWording } from '@/shared/lib/eventFormats';
import { AnimatedNumber, Avatar, OnReviewMark, SPRING } from '@/shared/ui';

const MAX_AVATARS = 7;

/** Seats left with a filling bar, or simply who is going when there is no limit. */
export function Seats({ event, wording }: { event: EventDetail; wording: EventWording }) {
  if (event.capacity === null) {
    if (event.participants_count === 0) return null;
    return (
      <p className="flex items-center gap-1.5 text-sm text-ink-soft">
        <Users size={15} aria-hidden />
        {wording.going(event.participants_count)}
      </p>
    );
  }
  const share = Math.min(1, event.participants_count / Math.max(1, event.capacity));
  const left = event.seats_left ?? 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-ink-soft">
          {wording.ofCapacity}{' '}
          <AnimatedNumber value={event.participants_count} className="font-semibold text-ink" /> из{' '}
          {event.capacity}
        </span>
        <span className={left > 0 ? 'font-medium text-success-ink' : 'font-medium text-ink-soft'}>
          {left > 0 ? wording.left(left) : wording.full}
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

/** «Что принесут участники» of a giveaway: what each participant said they bring (SPEC §3.4). */
export function Contributions({ placeId, count }: { placeId: number; count: number }) {
  const contributions = useQuery({
    queryKey: queryKeys.places.contributions(placeId),
    queryFn: () => eventsApi.contributions(placeId),
    enabled: count > 0,
  });
  const items = contributions.data ?? [];
  if (items.length === 0) return null;

  return (
    <div className="rounded-control bg-white/70 px-3 py-2.5">
      <h3 className="text-xs text-ink-soft">Что принесут участники</h3>
      <ul className="mt-1.5 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.comment_id} className="flex items-start gap-2 text-sm text-ink">
            <Avatar id={item.author.id} name={item.author.display_name} size={22} />
            <span className="min-w-0 flex-1">
              <span className="text-ink-soft">{item.author.display_name}: </span>
              {item.text}
              {item.on_review && <OnReviewMark className="ml-1.5 align-middle" />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
