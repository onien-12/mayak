import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';

import { useAuth } from '@/features/auth';
import { usePlaceParam } from '@/features/map';
import { queryKeys, usersApi, type PlaceCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { capitalize, formatDay, formatTime } from '@/shared/lib/format';
import { PRESS_SCALE, Skeleton, SPRING, STAGGER_STEP, TWEEN } from '@/shared/ui';

import { LiveDot } from './EventBadges';

const monthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

function DateTile({ iso, live }: { iso: string; live: boolean }) {
  const date = new Date(iso);
  return (
    <span
      className={cn(
        'flex size-12 shrink-0 flex-col items-center justify-center rounded-control leading-none',
        live ? 'bg-event text-white' : 'bg-event-soft text-event-ink',
      )}
    >
      <span className="font-display text-lg font-semibold">{date.getDate()}</span>
      <span className="text-2xs font-medium">{monthShort.format(date).replace('.', '')}</span>
    </span>
  );
}

function MyEventTile({ place, organizer }: { place: PlaceCard; organizer: boolean }) {
  const { openPlace } = usePlaceParam();
  const event = place.event;
  if (!event) return null;
  const live = event.phase === 'ongoing';
  const cancelled = event.phase === 'cancelled';

  return (
    <motion.button
      type="button"
      whileTap={{ scale: PRESS_SCALE }}
      transition={TWEEN.fast}
      onClick={() => openPlace(place.id)}
      className="flex w-60 items-center gap-3 rounded-card border border-line/70 bg-surface p-2 text-left"
    >
      <DateTile iso={event.starts_at} live={live} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{place.title}</span>
        <span
          className={cn(
            'flex items-center gap-1.5 truncate text-xs',
            cancelled ? 'font-medium text-danger-ink' : 'text-ink-soft',
          )}
        >
          {live && <LiveDot />}
          {cancelled
            ? 'Отменено'
            : live
              ? 'Идёт сейчас'
              : `${capitalize(formatDay(event.starts_at))}, ${formatTime(event.starts_at)}`}
        </span>
        <span
          className={cn(
            'mt-1 inline-flex h-5 items-center rounded-full px-1.5 text-2xs font-semibold',
            organizer ? 'bg-beam-soft text-ink' : 'bg-success-soft text-success-ink',
          )}
        >
          {organizer ? 'Вы организатор' : 'Вы идёте'}
        </span>
      </span>
    </motion.button>
  );
}

/** «Мои события»: upcoming events the user joined or organizes, as a horizontal shelf. */
export function MyEvents() {
  const { user, isAuthenticated } = useAuth();
  const mine = useQuery({
    queryKey: queryKeys.me.events,
    queryFn: usersApi.myEvents,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated || mine.isError || mine.data?.length === 0) return null;

  return (
    <section aria-label="Мои события">
      <h2 className="mb-2 text-sm font-semibold text-ink">
        Мои события
        {mine.data && (
          <span className="ml-1.5 font-normal text-ink-faint tabular-nums">{mine.data.length}</span>
        )}
      </h2>
      <ul className="-mx-4 no-scrollbar flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 lg:-mx-5 lg:scroll-px-5 lg:px-5">
        {mine.isPending
          ? [0, 1].map((key) => (
              <li key={key} className="shrink-0">
                <Skeleton className="h-[66px] w-60 rounded-card" />
              </li>
            ))
          : mine.data.map((place, index) => (
              <motion.li
                key={place.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING.sheet, delay: index * STAGGER_STEP }}
                className="shrink-0 snap-start"
              >
                <MyEventTile place={place} organizer={place.author_id === user?.id} />
              </motion.li>
            ))}
      </ul>
    </section>
  );
}
