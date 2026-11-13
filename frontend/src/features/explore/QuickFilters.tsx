import { Accessibility, CalendarCheck, CircleCheck, Shapes, Wallet } from 'lucide-react';

import type { Category, FieldDef, Layer } from '@/shared/api';
import { Chip, Select } from '@/shared/ui';

import { useExploreFilters } from './filtersStore';

const QUICK_KEYS = new Set(['free', 'accessible']);

interface QuickFiltersProps {
  layers: readonly Layer[];
  /** The single selected category — its fields become extra attribute filters. */
  category: Category | undefined;
}

function AttributeFilter({ field }: { field: FieldDef }) {
  const value = useExploreFilters((state) => state.attrs[field.key]);
  const setAttr = useExploreFilters((state) => state.setAttr);

  if (field.type === 'boolean') {
    return (
      <Chip
        selected={value === 'true'}
        onClick={() => setAttr(field.key, value === 'true' ? null : 'true')}
      >
        {field.label}
      </Chip>
    );
  }
  if (field.type === 'select' && field.options) {
    return (
      <Select
        aria-label={field.label}
        value={value ?? ''}
        onChange={(event) => setAttr(field.key, event.target.value || null)}
        placeholder={`${field.label}: любое`}
        options={field.options.map((option) => ({
          value: option.value,
          label: `${field.label}: ${option.label}`,
        }))}
        className="h-10 w-auto rounded-full py-0 pr-9 pl-3.5 text-sm font-medium lg:h-9 lg:text-sm"
      />
    );
  }
  return null;
}

/**
 * «Бесплатно», «Доступная среда», archive toggles, the nameless background objects and attribute
 * filters of the chosen category.
 */
export function QuickFilters({ layers, category }: QuickFiltersProps) {
  const free = useExploreFilters((state) => state.free);
  const accessible = useExploreFilters((state) => state.accessible);
  const includePast = useExploreFilters((state) => state.includePast);
  const includeResolved = useExploreFilters((state) => state.includeResolved);
  const includeUnnamed = useExploreFilters((state) => state.includeUnnamed);
  const toggleFlag = useExploreFilters((state) => state.toggleFlag);

  const fields = (category?.fields ?? []).filter(
    (field) => !QUICK_KEYS.has(field.key) && (field.type === 'boolean' || field.type === 'select'),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip icon={Wallet} tone="success" selected={free} onClick={() => toggleFlag('free')}>
        Бесплатно
      </Chip>
      <Chip
        icon={Accessibility}
        tone="official"
        selected={accessible}
        onClick={() => toggleFlag('accessible')}
      >
        Доступная среда
      </Chip>
      {layers.includes('event') && (
        <Chip
          icon={CalendarCheck}
          tone="event"
          selected={includePast}
          onClick={() => toggleFlag('includePast')}
        >
          Прошедшие события
        </Chip>
      )}
      {layers.includes('issue') && (
        <Chip
          icon={CircleCheck}
          tone="issue"
          selected={includeResolved}
          onClick={() => toggleFlag('includeResolved')}
        >
          Решённые проблемы
        </Chip>
      )}
      {(layers.includes('infrastructure') || layers.includes('tourism')) && (
        <Chip
          icon={Shapes}
          tone="infrastructure"
          selected={includeUnnamed}
          onClick={() => toggleFlag('includeUnnamed')}
        >
          Всё из OpenStreetMap
        </Chip>
      )}
      {fields.map((field) => (
        <AttributeFilter key={field.key} field={field} />
      ))}
    </div>
  );
}
