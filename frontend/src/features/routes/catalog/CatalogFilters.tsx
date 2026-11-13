import { ArrowDownWideNarrow, Search, X } from 'lucide-react';

import type { RoutesSort } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import {
  ROUTE_DIFFICULTIES,
  ROUTE_DIFFICULTY_META,
  ROUTE_KIND_META,
  ROUTE_KINDS,
} from '@/shared/lib/labels';
import { Button, Chip, Dropdown, DropdownItem, IconButton, Input } from '@/shared/ui';

import { useCatalogFilters } from './catalogStore';

const SORT_LABELS: Record<RoutesSort, { short: string; full: string }> = {
  new: { short: 'Новые', full: 'Сначала новые' },
  popular: { short: 'Популярные', full: 'Чаще сохраняют' },
  rating: { short: 'Рейтинг', full: 'С высоким рейтингом' },
};
const SORTS = Object.keys(SORT_LABELS) as RoutesSort[];

const KIND_SHORT = {
  walk: 'Пешком',
  car: 'Авто',
  bike: 'Велосипед',
  hike: 'Походы',
  excursion: 'Экскурсии',
} as const;

/** Search by title, description and tags. `pill` — floating over the map on phones. */
export function RouteSearchField({
  pill = false,
  onFocus,
}: {
  pill?: boolean;
  onFocus?: () => void;
}) {
  const search = useCatalogFilters((state) => state.search);
  const setSearch = useCatalogFilters((state) => state.setSearch);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }}
    >
      <Input
        type="search"
        enterKeyHint="search"
        icon={Search}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onFocus={onFocus}
        placeholder="Маршрут, место или тег"
        aria-label="Поиск маршрутов"
        className={cn(
          '[&::-webkit-search-cancel-button]:hidden',
          pill && 'rounded-full border-line/70 shadow-card glass',
        )}
        trailing={
          search && (
            <IconButton icon={X} label="Очистить поиск" size="sm" onClick={() => setSearch('')} />
          )
        }
      />
    </form>
  );
}

/** Horizontally scrollable kind chips, full-bleed in the panel. */
export function KindChips() {
  const kinds = useCatalogFilters((state) => state.kinds);
  const toggleKind = useCatalogFilters((state) => state.toggleKind);

  return (
    <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 lg:-mx-5 lg:px-5">
      {ROUTE_KINDS.map((kind) => {
        const meta = ROUTE_KIND_META[kind];
        return (
          <Chip
            key={kind}
            tone={meta.tone}
            icon={meta.icon}
            selected={kinds.includes(kind)}
            onClick={() => toggleKind(kind)}
          >
            {KIND_SHORT[kind]}
          </Chip>
        );
      })}
    </div>
  );
}

/** Difficulty chips and the sort menu. */
export function DifficultyAndSort({ sortable }: { sortable: boolean }) {
  const difficulties = useCatalogFilters((state) => state.difficulties);
  const toggleDifficulty = useCatalogFilters((state) => state.toggleDifficulty);
  const sort = useCatalogFilters((state) => state.sort);
  const setSort = useCatalogFilters((state) => state.setSort);

  return (
    <div className="flex items-center gap-2">
      <div className="-ml-1 no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto pl-1">
        {ROUTE_DIFFICULTIES.map((difficulty) => {
          const meta = ROUTE_DIFFICULTY_META[difficulty];
          return (
            <Chip
              key={difficulty}
              tone={meta.tone}
              icon={meta.icon}
              selected={difficulties.includes(difficulty)}
              onClick={() => toggleDifficulty(difficulty)}
            >
              {meta.label}
            </Chip>
          );
        })}
      </div>
      {sortable && (
        <Dropdown
          label="Сортировка"
          placement="bottom-end"
          trigger={(props) => (
            <Button
              {...props}
              variant="ghost"
              size="sm"
              icon={ArrowDownWideNarrow}
              className="shrink-0"
            >
              {SORT_LABELS[sort].short}
            </Button>
          )}
        >
          {SORTS.map((value) => (
            <DropdownItem key={value} onSelect={() => setSort(value)}>
              <span className={cn(value === sort && 'font-semibold text-brand')}>
                {SORT_LABELS[value].full}
              </span>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </div>
  );
}
