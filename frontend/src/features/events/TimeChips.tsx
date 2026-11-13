import { CalendarRange, History } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { Chip } from '@/shared/ui';

import { DateRangeDialog } from './DateRangeDialog';
import { useEventsFilters } from './filtersStore';
import { formatRange, TIME_PRESETS } from './period';

interface TimeChipsProps {
  /** Extra chips before the periods (e.g. «Фильтры» over the map). */
  leading?: ReactNode;
  /** Floating over the map: chips get a card shadow. */
  floating?: boolean;
  className?: string;
}

/** Horizontally scrollable period chips: «Сегодня», «Завтра», «Выходные»… and custom dates. */
export function TimeChips({ leading, floating = false, className }: TimeChipsProps) {
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
      <div
        className={cn(
          'no-scrollbar flex gap-2 overflow-x-auto',
          floating && '[&>*]:shadow-card',
          className,
        )}
      >
        {leading}
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
              className={floating && time !== preset.value ? 'bg-surface text-ink' : undefined}
            >
              {preset.label}
            </Chip>
          ))
        )}
        <Chip
          icon={CalendarRange}
          tone="event"
          selected={custom}
          onClick={() => setPicking(true)}
          className={floating && !custom ? 'bg-surface text-ink' : undefined}
        >
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
