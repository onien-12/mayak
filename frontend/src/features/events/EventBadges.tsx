import { CalendarX, Lock, UserPlus, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

import type { EventBrief } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber } from '@/shared/lib/format';
import { PHASE_META } from '@/shared/lib/labels';
import type { Tone } from '@/shared/lib/tones';
import { Badge, SPRING } from '@/shared/ui';

interface PhaseInfo {
  label: string;
  tone: Tone;
  icon?: LucideIcon;
}

const isFull = (event: EventBrief) =>
  event.capacity !== null && event.participants_count >= event.capacity;

/** What the phase means for a visitor, or `null` when there is nothing to point out. */
function phaseInfo(event: EventBrief): PhaseInfo | null {
  switch (event.phase) {
    case 'ongoing':
      return { label: PHASE_META.ongoing.label, tone: 'event' };
    case 'closed':
      return isFull(event)
        ? { label: 'Мест нет', tone: 'neutral', icon: Lock }
        : { label: 'Запись закрыта', tone: 'neutral', icon: Lock };
    case 'cancelled':
      return { label: PHASE_META.cancelled.label, tone: 'danger', icon: CalendarX };
    case 'finished':
      return { label: PHASE_META.finished.label, tone: 'neutral' };
    case 'open':
      return event.is_meetup ? { label: 'Набор открыт', tone: 'success', icon: UserPlus } : null;
    case 'soon':
      // The start time is already the first line of the card.
      return null;
  }
}

/** A small dot that keeps pulsing — «идёт сейчас». */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('relative flex size-2 shrink-0', className)}>
      <span className="absolute inset-0 animate-pulse-ring rounded-full bg-event" />
      <span className="relative size-2 rounded-full bg-event" />
    </span>
  );
}

/** Phase of the event in words, when it changes the decision: «Идёт сейчас», «Мест нет»… */
export function PhaseBadge({ event }: { event: EventBrief }) {
  const info = phaseInfo(event);
  if (!info) return null;
  if (event.phase === 'ongoing') {
    return (
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-event-soft px-2 text-xs font-medium text-event-ink">
        <LiveDot />
        {info.label}
      </span>
    );
  }
  return (
    <Badge tone={info.tone} icon={info.icon}>
      {info.label}
    </Badge>
  );
}

/**
 * Price: «Бесплатно», «600 ₽» or the source's note. Unknown price (`null`, imported events)
 * shows the note or nothing — never «бесплатно».
 */
export function PriceBadge({ event }: { event: EventBrief }) {
  if (event.price === null) {
    return event.price_note ? <Badge>{event.price_note}</Badge> : null;
  }
  if (event.price === 0) return <Badge tone="success">Бесплатно</Badge>;
  return <Badge>{event.price_note ?? `${formatNumber(event.price)} ₽`}</Badge>;
}

/** Meetups with a capacity: «5/12» with a compact fill bar. */
export function SeatsMeter({ event }: { event: EventBrief }) {
  if (event.capacity === null) return null;
  const share = Math.min(1, event.participants_count / Math.max(1, event.capacity));
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center gap-1.5 text-xs font-medium text-ink-soft"
      aria-label={`Записались ${event.participants_count} из ${event.capacity}`}
    >
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-canvas">
        <motion.span
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(share, 0.04) }}
          transition={SPRING.soft}
          className={cn(
            'block h-full origin-left rounded-full',
            share >= 1 ? 'bg-ink-faint' : 'bg-event',
          )}
        />
      </span>
      <span className="tabular-nums">
        {event.participants_count}/{event.capacity}
      </span>
    </span>
  );
}
