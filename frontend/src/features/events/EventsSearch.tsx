import { Search, X } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { IconButton, Input } from '@/shared/ui';

import { useEventsFilters } from './filtersStore';

interface EventsSearchProps {
  /** Floating pill over the map (phones) instead of an in-panel field. */
  pill?: boolean;
  onFocus?: () => void;
}

/** Search in titles, descriptions, venues and tags of events (backend `q`, debounced). */
export function EventsSearch({ pill = false, onFocus }: EventsSearchProps) {
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
