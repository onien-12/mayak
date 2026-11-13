import { CalendarClock, TriangleAlert, type LucideIcon } from 'lucide-react';

import { PlaceListItem } from '@/features/places';
import type { PlaceCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber } from '@/shared/lib/format';
import { StaggerItem } from '@/shared/ui';

interface SideSectionProps {
  title: string;
  icon: LucideIcon;
  places: readonly PlaceCard[];
  /** Calm box for problems: present, but not shouting over the area. */
  muted?: boolean;
}

function SideSection({ title, icon: Icon, places, muted = false }: SideSectionProps) {
  if (places.length === 0) return null;
  return (
    <section
      aria-label={title}
      className={cn('flex flex-col gap-2', muted && '-mx-1 rounded-card bg-canvas p-3')}
    >
      <h3
        className={cn(
          'flex items-center gap-2 text-sm font-semibold',
          muted ? 'text-ink-soft' : 'text-ink',
        )}
      >
        <Icon size={16} aria-hidden className={muted ? 'text-ink-faint' : 'text-event'} />
        {title}
        <span className="font-normal text-ink-faint">{formatNumber(places.length)}</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {places.map((place, index) => (
          <StaggerItem key={place.id} index={index}>
            <PlaceListItem place={place} hideArea />
          </StaggerItem>
        ))}
      </ul>
    </section>
  );
}

const startsAt = (place: PlaceCard) => place.event?.starts_at ?? '';

/** «Скоро здесь» (upcoming events inside) and «Проблемы здесь» (open issues, calm). */
export function AreaSideSections({ places }: { places: readonly PlaceCard[] }) {
  const events = places
    .filter((place) => place.layer === 'event')
    .sort((a, b) => startsAt(a).localeCompare(startsAt(b)));
  const issues = places.filter(
    (place) => place.layer === 'issue' && place.issue?.stage !== 'resolved',
  );

  return (
    <>
      <SideSection title="Скоро здесь" icon={CalendarClock} places={events} />
      <SideSection title="Проблемы здесь" icon={TriangleAlert} places={issues} muted />
    </>
  );
}
