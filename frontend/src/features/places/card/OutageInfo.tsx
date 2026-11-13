import {
  Building2,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Home,
  MessageSquareWarning,
} from 'lucide-react';
import { useMemo } from 'react';

import { MapDots } from '@/features/map';
import type { OutageBrief, OutageBuilding, PlaceDetail } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDateTime, pluralize, PLURALS } from '@/shared/lib/format';
import { EXTERNAL_SOURCE_META, OUTAGE_RESOURCE_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { buttonClasses, ExternalBadge } from '@/shared/ui';

const DOTS_MIN_ZOOM = 12;

/** «Тухачевского ул., 24» → street «Тухачевского ул.», house «24». */
function groupByStreet(buildings: readonly OutageBuilding[]): [street: string, houses: string[]][] {
  const streets = new Map<string, string[]>();
  for (const { address } of buildings) {
    const cut = address.lastIndexOf(', ');
    const street = cut === -1 ? address : address.slice(0, cut);
    const house = cut === -1 ? '' : address.slice(cut + 2);
    const houses = streets.get(street) ?? [];
    if (house) houses.push(house);
    streets.set(street, houses);
  }
  return [...streets.entries()].sort((a, b) => b[1].length - a[1].length);
}

interface OutageInfoProps {
  place: PlaceDetail;
  outage: OutageBrief;
}

/**
 * Imported utility outage: what is off, how many houses, who is responsible and until
 * when; the affected houses grouped by street and drawn as dots on the map.
 */
export function OutageInfo({ place, outage }: OutageInfoProps) {
  const resource = OUTAGE_RESOURCE_META[outage.resource];
  const Icon = resource.icon;
  const buildings = place.issue?.outage_buildings;
  const streets = useMemo(() => groupByStreet(buildings ?? []), [buildings]);
  const dots = useMemo(
    () =>
      (buildings ?? []).map((house, index) => ({
        id: index,
        lat: house.lat,
        lng: house.lng,
        color: resource.color,
      })),
    [buildings, resource.color],
  );
  const organisation = place.issue?.responsible_org;
  const plannedEnd = place.issue?.expected_fix_at;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5">
      <MapDots dots={dots} minZoom={DOTS_MIN_ZOOM} />

      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            TONES[resource.tone].solid,
          )}
        >
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug font-semibold text-ink">{resource.missing}</p>
          <p className="text-sm text-ink-soft">Отключение № {outage.number}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-2 rounded-control bg-canvas px-3 py-2">
          <Home size={16} aria-hidden className="shrink-0 text-ink-soft" />
          <dt className="sr-only">Затронуто</dt>
          <dd className="font-medium text-ink">
            {pluralize(outage.buildings_count, PLURALS.house)}
          </dd>
        </div>
        <div className="flex items-center gap-2 rounded-control bg-canvas px-3 py-2">
          <MessageSquareWarning size={16} aria-hidden className="shrink-0 text-ink-soft" />
          <dt className="sr-only">Жалобы жителей</dt>
          <dd className="font-medium text-ink">
            {pluralize(outage.complaints_count, PLURALS.complaint)}
          </dd>
        </div>
      </dl>

      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-start gap-2">
          <Building2 size={15} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
          <dt className="shrink-0 text-ink-soft">Организация:</dt>
          <dd className="min-w-0 font-medium text-ink">
            {organisation ?? 'не указана — по жалобам жителей'}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <CalendarClock size={15} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
          <dt className="shrink-0 text-ink-soft">Плановое окончание:</dt>
          <dd className="min-w-0 font-medium text-ink">
            {plannedEnd ? formatDateTime(plannedEnd) : 'неизвестно'}
          </dd>
        </div>
      </dl>

      {streets.length > 0 && (
        <details className="group rounded-control bg-canvas">
          <summary className="flex min-h-11 list-none items-center justify-between gap-2 px-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            Адреса: {pluralize(streets.length, PLURALS.street)}
            <ChevronDown
              size={17}
              aria-hidden
              className="text-ink-faint transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <ul className="flex flex-col gap-2 px-3 pb-3 text-sm">
            {streets.map(([street, houses]) => (
              <li key={street}>
                <span className="font-medium text-ink">{street}</span>
                {houses.length > 0 && <span className="text-ink-soft"> — {houses.join(', ')}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {place.external && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ExternalBadge external={place.external} size="md" />
          <a
            href={place.external.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: 'ghost', size: 'sm' })}
          >
            {EXTERNAL_SOURCE_META[place.external.source].linkLabel}
            <ExternalLink size={15} aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}
