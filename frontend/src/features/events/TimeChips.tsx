import { CalendarRange, History } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { Chip } from '@/shared/ui';

import { DateRangeDialog } from './DateRangeDialog';
import { useEventsFilters } from './filtersStore';
import { formatRange, TIME_PRESETS } from './period';

interface TimeChipsProps {
  className?: string;
}

/** Horizontally scrollable period chips: «Сегодня», «Завтра», «Выходные»… and custom dates. */
export function TimeChips({ className }: TimeChipsProps) {
  const time = useEventsFilters((state) => state.time);
  const range = useEventsFilters((state) => state.range);
  const past = useEventsFilters((state) => state.past);
  const setTime = useEventsFilters((state) => state.setTime);
  const setRange = useEventsFilters((state) => state.setRange);
  const togglePast = useEventsFilters((state) => state.togglePast);
  const [picking, setPicking] = useState(false);
  const custom = time === 'custom' && range !== null;

  return (
    <>
      <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
        {past ? (
          <Chip icon={History} tone="event" selected onRemove={togglePast}>
            Прошедшие
          </Chip>
        ) : (
          TIME_PRESETS.map((preset) => (
            <Chip
              key={preset.value}
              tone="event"
              selected={time === preset.value}
              onClick={() => setTime(preset.value)}
            >
              {preset.label}
            </Chip>
          ))
        )}
        <Chip icon={CalendarRange} tone="event" selected={custom} onClick={() => setPicking(true)}>
          {custom ? formatRange(range) : 'Даты'}
        </Chip>
      </div>
      <DateRangeDialog
        open={picking}
        onClose={() => setPicking(false)}
        initial={range}
        onApply={setRange}
      />
    </>
  );
}
