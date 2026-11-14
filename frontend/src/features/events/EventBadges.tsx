import { CalendarX, Lock, type LucideIcon } from 'lucide-react';

import type { EventBrief } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { PHASE_META } from '@/shared/lib/labels';
import type { Tone } from '@/shared/lib/tones';
import { Badge } from '@/shared/ui';

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
    case 'soon':
      // Open for joining is the usual state, and the start time is on the card already.
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
