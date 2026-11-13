import { SlidersHorizontal } from 'lucide-react';

import { Chip, MapTopBar, usePanelStore } from '@/shared/ui';

import { EventsSearch } from './EventsSearch';
import { TimeChips } from './TimeChips';

/** Number of active filters on a «Фильтры» control. */
export function FilterCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-brand px-1.5 text-2xs leading-[18px] font-semibold text-white">
      {count}
    </span>
  );
}

interface EventsTopBarProps {
  activeFilters: number;
  onOpenFilters: () => void;
}

/** Phone: search pill and a scrollable row of «Фильтры» + period chips over the map. */
export function EventsTopBar({ activeFilters, onOpenFilters }: EventsTopBarProps) {
  const reveal = usePanelStore((state) => state.reveal);

  return (
    <MapTopBar
      extra={
        <TimeChips
          floating
          className="px-3 pb-1"
          leading={
            <Chip
              icon={SlidersHorizontal}
              selected={activeFilters > 0}
              onClick={onOpenFilters}
              className={activeFilters > 0 ? undefined : 'bg-surface text-ink'}
            >
              Фильтры
              <FilterCount count={activeFilters} />
            </Chip>
          }
        />
      }
    >
      <EventsSearch pill onFocus={reveal} />
    </MapTopBar>
  );
}
