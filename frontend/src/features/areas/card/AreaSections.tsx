import { CalendarClock, ChevronDown, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { PlaceListItem } from '@/features/places';
import type { PlaceCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber, pluralize, PLURALS } from '@/shared/lib/format';
import { Button, StaggerItem } from '@/shared/ui';

/** Rows «Скоро здесь» shows at once; further afisha events fold under «ещё N из афиши». */
const SHORT_LIST = 4;

interface SideSectionProps {
  title: string;
  icon: LucideIcon;
  places: readonly PlaceCard[];
  /** Shown after `places` on request: «ещё N из афиши». */
  folded?: readonly PlaceCard[];
  /** Where a row opens: the section the object lives in. */
  sectionPath: string;
  /** Calm box for problems: present, but not shouting over the area. */
  muted?: boolean;
}

function SideSection({
  title,
  icon: Icon,
  places,
  folded = [],
  sectionPath,
  muted = false,
}: SideSectionProps) {
  const navigate = useNavigate();
  const [unfolded, setUnfolded] = useState(false);
  const shown = unfolded ? [...places, ...folded] : places;
  const total = places.length + folded.length;
  if (total === 0) return null;
  const open = (place: PlaceCard) =>
    void navigate({ pathname: sectionPath, search: `?place=${place.id}` });

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
        <span className="font-normal text-ink-faint">{formatNumber(total)}</span>
      </h3>
      {shown.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shown.map((place, index) => (
            <StaggerItem key={place.id} index={index}>
              <PlaceListItem place={place} onSelect={open} hideArea />
            </StaggerItem>
          ))}
        </ul>
      )}
      {!unfolded && folded.length > 0 && (
        <Button variant="secondary" size="sm" icon={ChevronDown} onClick={() => setUnfolded(true)}>
          ещё {pluralize(folded.length, PLURALS.event)} из афиши
        </Button>
      )}
    </section>
  );
}

const startsAt = (place: PlaceCard) => place.event?.starts_at ?? '';
const byStart = (a: PlaceCard, b: PlaceCard) => startsAt(a).localeCompare(startsAt(b));

/**
 * «Скоро здесь» — upcoming events inside, residents' first (the soonest first), then the
 * afisha's, beyond a short list folded under «ещё N из афиши» — and «Проблемы здесь» (open
 * issues, calm). Text in the card only: the «Карта» section does not draw events or problems,
 * so a row opens the event in «События» and a problem in «Проблемы».
 */
export function AreaEventsSection({ places }: { places: readonly PlaceCard[] }) {
  const events = places.filter((place) => place.layer === 'event').sort(byStart);
  const residents = events.filter((place) => place.external === null);
  const afisha = events.filter((place) => place.external !== null);
  // Residents' events are always listed; the afisha fills up to a short list, the rest folds.
  const room =
    events.length > SHORT_LIST ? Math.max(0, SHORT_LIST - residents.length) : afisha.length;

  return (
    <SideSection
      title="Скоро здесь"
      icon={CalendarClock}
      places={[...residents, ...afisha.slice(0, room)]}
      folded={afisha.slice(room)}
      sectionPath="/events"
    />
  );
}

export function AreaProblemsSection({ places }: { places: readonly PlaceCard[] }) {
  const issues = places.filter(
    (place) => place.layer === 'issue' && place.issue?.stage !== 'resolved',
  );
  return (
    <SideSection
      title="Проблемы здесь"
      icon={TriangleAlert}
      places={issues}
      sectionPath="/problems"
      muted
    />
  );
}
