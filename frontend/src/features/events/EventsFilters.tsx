import { History, Wallet } from 'lucide-react';
import { memo, type ReactNode } from 'react';

import { useUserLocation } from '@/features/map';
import type { EventsSort, Layer } from '@/shared/api';
import { useLayerCategories } from '@/shared/hooks';
import { categoryIcon } from '@/shared/lib/categoryIcons';
import { Chip, SegmentedControl } from '@/shared/ui';

import { useEventsFilters, type EventKind, type EventOrigin } from './filtersStore';

const EVENT_LAYERS: readonly Layer[] = ['event'];

const KIND_OPTIONS: readonly { value: EventKind; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'city', label: 'Городские' },
  { value: 'meetups', label: 'Встречи' },
];

const ORIGIN_OPTIONS: readonly { value: EventOrigin; label: string }[] = [
  { value: 'community', label: 'От жителей' },
  { value: 'all', label: 'Все' },
  { value: 'external', label: 'Афиша VL.ru' },
];

const SORT_OPTIONS: readonly { value: EventsSort; label: string }[] = [
  { value: 'start', label: 'По времени' },
  { value: 'popular', label: 'Популярные' },
  { value: 'price', label: 'Цена' },
  { value: 'distance', label: 'Рядом' },
];

const RADIUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'any', label: 'Весь город' },
  ...[1, 3, 5, 10].map((km) => ({ value: String(km), label: `${km} км` })),
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Format, source, categories, distance, price / archive toggles and sorting of the afisha.
 * Memoised: the panel re-renders with every viewport change, and each render of the
 * segmented controls' shared-layout thumbs makes `motion` measure the page.
 */
export const EventsFilters = memo(function EventsFilters() {
  const filters = useEventsFilters();
  const categories = useLayerCategories(EVENT_LAYERS);
  const { location, locate } = useUserLocation();
  const measured = filters.radiusKm !== null || filters.sort === 'distance';

  const setRadius = (value: string) => {
    filters.setRadius(value === 'any' ? null : Number(value));
    if (value !== 'any' && !location) void locate({ fly: false });
  };

  return (
    <div className="flex flex-col gap-5">
      <Group title="Формат">
        <SegmentedControl
          label="Формат"
          value={filters.kind}
          onChange={filters.setKind}
          options={KIND_OPTIONS}
        />
      </Group>
      <Group title="Кто добавил">
        <SegmentedControl
          label="Источник"
          value={filters.origin}
          onChange={filters.setOrigin}
          options={ORIGIN_OPTIONS}
        />
      </Group>
      {categories.length > 0 && (
        <Group title="Категории">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <Chip
                key={category.id}
                tone="event"
                icon={categoryIcon(category.slug, category.layer)}
                selected={filters.categoryIds.includes(category.id)}
                onClick={() => filters.toggleCategory(category.id)}
              >
                {category.name}
              </Chip>
            ))}
          </div>
        </Group>
      )}
      <Group title="Расстояние">
        <SegmentedControl
          label="Расстояние"
          size="sm"
          value={filters.radiusKm === null ? 'any' : String(filters.radiusKm)}
          onChange={setRadius}
          options={RADIUS_OPTIONS}
        />
        {measured && (
          <p className="mt-1.5 text-xs text-ink-faint">
            {location ? 'Считаем от вас.' : 'Считаем от центра карты — геолокация выключена.'}
          </p>
        )}
      </Group>
      <Group title="Условия">
        <div className="flex flex-wrap gap-1.5">
          <Chip icon={Wallet} tone="success" selected={filters.free} onClick={filters.toggleFree}>
            Бесплатные
          </Chip>
          <Chip icon={History} tone="event" selected={filters.past} onClick={filters.togglePast}>
            Прошедшие
          </Chip>
        </div>
      </Group>
      <Group title="Сортировка">
        <SegmentedControl
          label="Сортировка"
          size="sm"
          value={filters.sort}
          onChange={filters.setSort}
          options={
            filters.free ? SORT_OPTIONS.filter((option) => option.value !== 'price') : SORT_OPTIONS
          }
        />
      </Group>
    </div>
  );
});
