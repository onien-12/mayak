import { CalendarRange, HandHelping, History, Megaphone, Wallet } from 'lucide-react';
import { useState } from 'react';

import { useCategories } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { FORMAT_SLUGS } from '@/shared/lib/eventFormats';
import { Chip } from '@/shared/ui';

import { DateRangeDialog } from './DateRangeDialog';
import { useEventsFilters } from './filtersStore';
import { formatRange, QUICK_PERIODS, RANGE_PRESETS } from './period';

/** Categories with a chip in the quick row; the same state as their chips inside «Фильтры». */
const QUICK_CATEGORIES = [
  { slug: FORMAT_SLUGS.help, label: 'Помощь', icon: HandHelping },
  { slug: 'city', label: 'Городские события', icon: Megaphone },
] as const;

interface QuickChipsProps {
  className?: string;
}

/**
 * The quick row of «События», one line that scrolls sideways on phones: «Все даты», «Сегодня»,
 * «Завтра» and «Даты» (longer presets live in its dialog), then «Бесплатные», «Помощь» and
 * «Городские события». Every chip toggles the same store state as its twin inside «Фильтры».
 */
export function QuickChips({ className }: QuickChipsProps) {
  const filters = useEventsFilters();
  const { categories } = useCategories();
  const [picking, setPicking] = useState(false);
  const { time, range, past } = filters;
  const preset = RANGE_PRESETS.find((item) => item.value === time);
  const custom = time === 'custom' && range !== null;
  const quickCategories = QUICK_CATEGORIES.flatMap((item) => {
    const category = categories.find((candidate) => candidate.slug === item.slug);
    return category ? [{ ...item, id: category.id }] : [];
  });

  return (
    <>
      <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
        {past ? (
          <Chip icon={History} tone="event" selected onRemove={filters.togglePast}>
            Прошедшие
          </Chip>
        ) : (
          QUICK_PERIODS.map((period) => (
            <Chip
              key={period.value}
              tone="event"
              selected={time === period.value}
              onClick={() => filters.setTime(period.value)}
            >
              {period.label}
            </Chip>
          ))
        )}
        <Chip
          icon={CalendarRange}
          tone="event"
          selected={custom || preset !== undefined}
          onClick={() => setPicking(true)}
        >
          {custom ? formatRange(range) : (preset?.label ?? 'Даты')}
        </Chip>
        <Chip
          icon={Wallet}
          tone="success"
          selected={filters.free}
          onClick={filters.toggleFree}
          className="ml-1.5"
        >
          Бесплатные
        </Chip>
        {quickCategories.map((item) => (
          <Chip
            key={item.slug}
            icon={item.icon}
            tone="event"
            selected={filters.categoryIds.includes(item.id)}
            onClick={() => filters.toggleCategory(item.id)}
          >
            {item.label}
          </Chip>
        ))}
      </div>
      <DateRangeDialog
        open={picking}
        onClose={() => setPicking(false)}
        initial={range}
        onApply={filters.setRange}
        time={time}
        onPreset={filters.setTime}
      />
    </>
  );
}
