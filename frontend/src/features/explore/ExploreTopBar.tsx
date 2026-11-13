import { Accessibility, SlidersHorizontal, Wallet } from 'lucide-react';

import { NotesToggle } from '@/features/spot';
import { LAYER_META, LAYERS } from '@/shared/lib/labels';
import { Chip, MapTopBar, usePanelStore } from '@/shared/ui';

import { useExploreFilters } from './filtersStore';
import { HomeChip } from './HomeChip';
import { SearchField } from './SearchField';

interface ExploreTopBarProps {
  activeFilters: number;
  onOpenFilters: () => void;
}

/** Phone: search pill and a horizontally scrollable row of quick filters over the map. */
export function ExploreTopBar({ activeFilters, onOpenFilters }: ExploreTopBarProps) {
  const filters = useExploreFilters();
  const reveal = usePanelStore((state) => state.reveal);

  return (
    <MapTopBar
      extra={
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1 [&>*]:shadow-card">
          <Chip
            icon={SlidersHorizontal}
            selected={activeFilters > 0}
            onClick={onOpenFilters}
            className={activeFilters > 0 ? undefined : 'bg-surface text-ink'}
          >
            Фильтры
            {activeFilters > 0 && (
              <span className="-mr-1 rounded-full bg-brand px-1.5 text-2xs leading-[18px] font-semibold text-white">
                {activeFilters}
              </span>
            )}
          </Chip>
          <NotesToggle />
          <HomeChip className="bg-surface text-ink" />
          {LAYERS.map((layer) => (
            <Chip
              key={layer}
              tone={LAYER_META[layer].tone}
              icon={LAYER_META[layer].icon}
              selected={filters.layers.includes(layer)}
              onClick={() => filters.toggleLayer(layer)}
            >
              {LAYER_META[layer].short}
            </Chip>
          ))}
          <Chip
            icon={Wallet}
            tone="success"
            selected={filters.free}
            onClick={() => filters.toggleFlag('free')}
          >
            Бесплатно
          </Chip>
          <Chip
            icon={Accessibility}
            tone="official"
            selected={filters.accessible}
            onClick={() => filters.toggleFlag('accessible')}
          >
            Доступная среда
          </Chip>
        </div>
      }
    >
      <SearchField pill onFocus={reveal} />
    </MapTopBar>
  );
}
