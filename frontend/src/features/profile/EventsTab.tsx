import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useAuth } from '@/features/auth';
import { queryKeys, usersApi, type PlaceCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { capitalize, formatDay, formatTime } from '@/shared/lib/format';
import { buttonClasses, EmptyState, ErrorState, ListSkeleton, StaggerItem } from '@/shared/ui';

const monthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

function DateTile({ iso, live, faded }: { iso: string; live: boolean; faded: boolean }) {
  const date = new Date(iso);
  return (
    <span
      className={cn(
        'flex size-12 shrink-0 flex-col items-center justify-center rounded-control leading-none',
        live ? 'bg-event text-white' : 'bg-event-soft text-event-ink',
        faded && 'opacity-60',
      )}
    >
      <span className="font-display text-lg font-semibold">{date.getDate()}</span>
      <span className="text-2xs font-medium">{monthShort.format(date).replace('.', '')}</span>
    </span>
  );
}

function when(place: PlaceCard): string {
  const event = place.event;
  if (!event) return '';
  if (event.phase === 'cancelled') return 'Отменено';
  if (event.phase === 'ongoing') return 'Идёт сейчас';
  return `${capitalize(formatDay(event.starts_at))}, ${formatTime(event.starts_at)}`;
}

/** One event the person organises or joined; opens it in «События». */
function EventRow({ place, organizer }: { place: PlaceCard; organizer: boolean }) {
  const event = place.event;
  if (!event) return null;
  const over = event.phase === 'finished' || event.phase === 'cancelled';
  return (
    <Link
      to={{ pathname: '/events', search: `?place=${place.id}` }}
      className="flex items-center gap-3 rounded-card border border-line/70 bg-surface p-2.5 transition-[border-color,box-shadow,transform] hover:border-ink-faint/50 hover:shadow-card active:scale-[0.98]"
    >
      <DateTile iso={event.starts_at} live={event.phase === 'ongoing'} faded={over} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'line-clamp-2 text-base leading-tight font-semibold',
            over ? 'text-ink-soft' : 'text-ink',
          )}
        >
          {place.title}
        </span>
        <span
          className={cn(
            'mt-0.5 block truncate text-sm',
            event.phase === 'cancelled' ? 'font-medium text-danger-ink' : 'text-ink-soft',
          )}
        >
          {[when(place), organizer ? 'вы организатор' : over ? 'вы были записаны' : 'вы идёте']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-faint" />
    </Link>
  );
}

function EventRows({ places }: { places: readonly PlaceCard[] }) {
  const { user } = useAuth();
  return (
    <ul className="flex flex-col gap-2">
      {places.map((place, index) => (
        <StaggerItem key={place.id} index={index}>
          <EventRow place={place} organizer={place.author_id === user?.id} />
        </StaggerItem>
      ))}
    </ul>
  );
}

/** Past events, fetched only when the person unfolds them. */
function PastEvents() {
  const [open, setOpen] = useState(false);
  const past = useQuery({
    queryKey: queryKeys.me.pastEvents,
    queryFn: () => usersApi.myEvents('past'),
    enabled: open,
  });

  return (
    <section aria-label="Прошедшие события" className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center justify-between rounded-control bg-canvas px-3.5 text-sm font-semibold text-ink"
      >
        Прошедшие и отменённые
        <ChevronDown
          size={18}
          aria-hidden
          className={cn('text-ink-faint transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open &&
        (past.isPending ? (
          <ListSkeleton rows={2} />
        ) : past.isError ? (
          <ErrorState error={past.error} onRetry={() => void past.refetch()} />
        ) : past.data.length === 0 ? (
          <p className="px-1 text-sm text-ink-soft">Прошедших событий пока нет.</p>
        ) : (
          <EventRows places={past.data} />
        ))}
    </section>
  );
}

/**
 * «Мои события» of the own profile: what the person organises and what they joined — upcoming
 * first, past ones folded below. Each row opens the event in «События».
 */
export function EventsTab() {
  const upcoming = useQuery({
    queryKey: queryKeys.me.events,
    queryFn: () => usersApi.myEvents(),
  });

  return (
    <div className="flex flex-col gap-4">
      {upcoming.isPending ? (
        <ListSkeleton rows={2} />
      ) : upcoming.isError ? (
        <ErrorState error={upcoming.error} onRetry={() => void upcoming.refetch()} />
      ) : upcoming.data.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Впереди ничего нет"
          description="Запишитесь на встречу, откликнитесь на просьбу соседей или соберите людей сами — всё это появится здесь."
          action={
            <Link to="/events" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              Открыть «События»
            </Link>
          }
        />
      ) : (
        <section aria-label="Впереди" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink">Впереди</h2>
          <EventRows places={upcoming.data} />
        </section>
      )}
      <PastEvents />
    </div>
  );
}
