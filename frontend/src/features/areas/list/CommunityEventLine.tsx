import { CalendarClock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import type { CommunityEventRef } from '@/shared/api';
import { cn } from '@/shared/lib/cn';

import { eventWhen } from '../lib/eventWhen';

interface CommunityEventLineProps {
  event: CommunityEventRef;
  /** Further residents' events inside the location: «· ещё 2». */
  more?: number;
  className?: string;
}

/**
 * «Скоро здесь: Забег с собаками · сб, 12:00» — an upcoming event residents made inside the
 * location (SPEC §17). Opens the event in «События», where events live (the map shows places
 * only); in a list card it sits above the card's own link.
 */
export function CommunityEventLine({ event, more = 0, className }: CommunityEventLineProps) {
  const now = new Date();
  const started = new Date(event.starts_at) <= now;

  return (
    <Link
      to={{ pathname: '/events', search: `?place=${event.id}` }}
      data-community-event={event.id}
      className={cn(
        'relative z-10 flex min-w-0 items-center gap-1.5 rounded-control text-left text-sm text-event-ink transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand',
        className,
      )}
    >
      <CalendarClock size={15} aria-hidden className="shrink-0" />
      <span className="line-clamp-2 min-w-0">
        <span className="font-semibold">{started ? 'Сейчас здесь' : 'Скоро здесь'}:</span>{' '}
        {event.title}
        {!started && <span className="text-ink-soft"> · {eventWhen(event.starts_at, now)}</span>}
        {more > 0 && <span className="text-ink-soft"> · ещё {more}</span>}
      </span>
      <ChevronRight size={15} aria-hidden className="shrink-0 text-ink-faint" />
    </Link>
  );
}
