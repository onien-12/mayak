import { Search, X } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { IconButton, Input } from '@/shared/ui';

import { useExploreFilters } from './filtersStore';

interface SearchFieldProps {
  /** Floating pill over the map (phones) instead of an in-panel field. */
  pill?: boolean;
  onFocus?: () => void;
}

/** Search by places (backend `q`) and addresses (2GIS Suggest). */
export function SearchField({ pill = false, onFocus }: SearchFieldProps) {
  const search = useExploreFilters((state) => state.search);
  const setSearch = useExploreFilters((state) => state.setSearch);

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
        placeholder="Место, категория или адрес"
        aria-label="Поиск по карте"
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
