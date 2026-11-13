import type { ModerationQueueSort, ModerationTrigger, TargetType } from '@/shared/api';
import { LAYER_META, LAYERS, MODERATION_TRIGGER_META } from '@/shared/lib/labels';
import { Chip, SegmentedControl, Select } from '@/shared/ui';

import { SORTS, type QueueParams } from './useQueueParams';

const SORT_LABELS: Record<ModerationQueueSort, string> = {
  risk: 'По риску',
  complaints: 'По жалобам',
  newest: 'Новые',
  oldest: 'Старые',
};

type TargetOption = 'all' | TargetType;

const TARGET_OPTIONS = [
  { value: 'all', label: 'Всё' },
  { value: 'place', label: 'Места' },
  { value: 'route', label: 'Маршруты' },
] as const satisfies readonly { value: TargetOption; label: string }[];

const TRIGGER_OPTIONS = (Object.keys(MODERATION_TRIGGER_META) as ModerationTrigger[]).map(
  (trigger) => ({ value: trigger, label: MODERATION_TRIGGER_META[trigger].label }),
);

/** Target type, layer, trigger and sort of the queue. */
export function QueueFilters({ params }: { params: QueueParams }) {
  const { filters } = params;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SegmentedControl
          label="Что проверяем"
          value={filters.target_type ?? 'all'}
          onChange={(value) => params.setTarget(value === 'all' ? undefined : value)}
          options={TARGET_OPTIONS}
          className="sm:w-72"
        />
        <div className="grid flex-1 grid-cols-2 gap-2">
          <Select
            aria-label="Причина"
            value={filters.trigger ?? ''}
            placeholder="Все причины"
            options={TRIGGER_OPTIONS}
            onChange={(event) =>
              params.setTrigger((event.target.value || undefined) as ModerationTrigger | undefined)
            }
          />
          <Select
            aria-label="Сортировка"
            value={filters.sort ?? 'risk'}
            options={SORTS.map((sort) => ({ value: sort, label: SORT_LABELS[sort] }))}
            onChange={(event) => params.setSort(event.target.value as ModerationQueueSort)}
          />
        </div>
      </div>
      {filters.target_type !== 'route' && (
        <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          {LAYERS.map((layer) => {
            const meta = LAYER_META[layer];
            const selected = filters.layer === layer;
            return (
              <Chip
                key={layer}
                tone={meta.tone}
                icon={meta.icon}
                selected={selected}
                onClick={() => params.setLayer(selected ? undefined : layer)}
              >
                {meta.short}
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
}
