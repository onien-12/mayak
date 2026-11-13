import { useState } from 'react';

import type { OutageResource, PlaceDetail } from '@/shared/api';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { OUTAGE_RESOURCE_META } from '@/shared/lib/labels';
import { Button, EmptyState, StaggerItem } from '@/shared/ui';

import { OutageCard } from './OutageCard';
import type { OutagePlace } from './useOutages';

const PAGE_SIZE = 15;

interface OutageListProps {
  outages: readonly OutagePlace[];
  details: ReadonlyMap<number, PlaceDetail>;
  resource: OutageResource | null;
}

/** Current outages, most houses first. */
export function OutageList({ outages, details, resource }: OutageListProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  return (
    <section aria-label="Текущие отключения">
      <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-ink">
        {resource ? OUTAGE_RESOURCE_META[resource].missing : 'Все отключения'}
        <span className="text-xs font-normal text-ink-faint">
          {pluralize(outages.length, PLURALS.outage)} · больше домов сверху
        </span>
      </h2>
      {outages.length === 0 ? (
        <EmptyState
          icon={
            resource ? OUTAGE_RESOURCE_META[resource].icon : OUTAGE_RESOURCE_META.cold_water.icon
          }
          title="Таких отключений нет"
          description="По этому ресурсу сейчас всё работает."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {outages.slice(0, limit).map((place, index) => (
            <StaggerItem key={place.id} index={index}>
              <OutageCard place={place} detail={details.get(place.id)} />
            </StaggerItem>
          ))}
        </ul>
      )}
      {outages.length > limit && (
        <Button
          variant="secondary"
          block
          className="mt-3"
          onClick={() => setLimit(limit + PAGE_SIZE)}
        >
          Показать ещё
        </Button>
      )}
    </section>
  );
}
