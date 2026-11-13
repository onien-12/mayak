import { Search, X } from 'lucide-react';

import { IconButton, Input } from '@/shared/ui';

import { useEventsFilters } from './filtersStore';

interface EventsSearchProps {
  onFocus?: () => void;
}

/** Search in titles, descriptions, venues and tags of events (backend `q`, debounced). */
export function EventsSearch({ onFocus }: EventsSearchProps) {
  const search = useEventsFilters((state) => state.search);
  const setSearch = useEventsFilters((state) => state.setSearch);

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
        placeholder="Концерт, встреча, площадка"
        aria-label="Поиск по событиям"
        // Level with the «Фильтры» button next to it.
        className="h-11 [&::-webkit-search-cancel-button]:hidden"
        trailing={
          search && (
            <IconButton icon={X} label="Очистить поиск" size="sm" onClick={() => setSearch('')} />
          )
        }
      />
    </form>
  );
}
