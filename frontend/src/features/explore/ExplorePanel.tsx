import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { CreateAreaHint, useMapAreas } from '@/features/areas';
import { useSearchSignal } from '@/features/interests';
import { useMapPlaces } from '@/features/map';
import { NotesMapLayer, NotesToggle } from '@/features/spot';
import { useCategories, useIsDesktop, useRevealOnOpen } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import {
  Button,
  Chip,
  IconButton,
  PanelLayout,
  Spinner,
  useOfferAddPlace,
  usePanelSection,
  usePanelStore,
} from '@/shared/ui';

import { AddressResults } from './AddressResults';
import { CategoryFilter } from './CategoryFilter';
import { HomeChip } from './HomeChip';
import { countActiveFilters, useExploreFilters } from './filtersStore';
import { LayerToggles } from './LayerToggles';
import { PlaceResults } from './PlaceResults';
import { QuickFilters } from './QuickFilters';
import { SearchField } from './SearchField';
import { TrustFilter } from './TrustFilter';
import { useExploreAreas } from './useExploreAreas';
import { useExploreList, type ExploreList } from './useExploreList';
import { useExplorePlaces } from './useExplorePlaces';
import { useForYouMap } from './useForYouMap';
import { useListOrder } from './useListOrder';

const FILTERS_ID = 'explore-filters';

/** «154 места · 12 на карте» — the whole list and its share in the map view. */
function resultsTitle(list: ExploreList, hasLayers: boolean): string {
  if (!hasLayers) return 'Слои выключены';
  if (list.isLoading) return 'Ищем места…';
  if (list.isError) return 'Нет связи';
  if (list.total === 0) return 'Здесь пока пусто';
  const total = pluralize(list.total, PLURALS.place);
  return list.inView > 0 ? `${total} · ${list.inView} на карте` : total;
}

interface FiltersToggleProps {
  open: boolean;
  count: number;
  onToggle: () => void;
}

/** Phones: the «Фильтры» button next to the search; the filters open at the top of the list. */
function FiltersToggle({ open, count, onToggle }: FiltersToggleProps) {
  return (
    <Button
      variant="secondary"
      icon={SlidersHorizontal}
      aria-expanded={open}
      aria-controls={FILTERS_ID}
      onClick={onToggle}
      className="shrink-0 px-3"
    >
      Фильтры
      {count > 0 && (
        <span className="rounded-full bg-brand px-1.5 text-2xs leading-[18px] font-semibold text-white">
          {count}
        </span>
      )}
      <ChevronDown
        size={16}
        aria-hidden
        className={cn('text-ink-faint transition-transform duration-200', open && 'rotate-180')}
      />
    </Button>
  );
}

/**
 * «Карта». The list holds everything that matches the filters city-wide — what is in the map
 * view first — and the map draws it around the viewport.
 * Phones: search and «Фильтры» sit in the panel above the list they filter — nothing of the
 * section floats over the map, and the half-open sheet still shows the first card; the filters
 * (layers and notes among them) open at the top of the list and the sheet goes full height for
 * them and for the search.
 * Desktop: search, layers and the list in the side panel; the other filters unfold from the
 * «Фильтры» chip, so the list starts right under the layers.
 */
export function ExplorePanel() {
  const isDesktop = useIsDesktop();
  const setSnap = usePanelStore((state) => state.setSnap);
  const filters = useExploreFilters();
  const results = useExplorePlaces();
  const { view, stale, refresh, anchor } = useListOrder();
  const list = useExploreList(view, results.activeSearch);
  const areas = useExploreAreas(view, results.activeSearch);
  const { byId } = useCategories();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRevealOnOpen<HTMLElement>(filtersOpen);
  useMapPlaces(results.places, { fold: areas.fold });
  useMapAreas(areas.areas);
  useOfferAddPlace(!usePanelSection().covered);
  useSearchSignal(filters.search);

  const activeFilters = countActiveFilters(filters);
  const [onlyCategoryId] = filters.categoryIds;
  const singleCategory =
    filters.categoryIds.length === 1 && onlyCategoryId !== undefined
      ? byId.get(onlyCategoryId)
      : undefined;
  const scope = results.activeSearch
    ? `по запросу «${results.activeSearch}» · сначала на карте`
    : 'сначала на карте · от жителей · ближние выше';
  const title = resultsTitle(list, results.hasLayers);

  // «Для вас» leads the list (SPEC §23.5); a text search makes the list about the query instead.
  const forYou = useForYouMap({
    hidden: results.activeSearch !== '',
    areasShown: areas.fold !== undefined,
  });
  // Phones: the sheet scrolls only at full height, and the keyboard needs the room anyway.
  const expand = () => {
    if (!isDesktop) setSnap('full');
  };
  const toggleFilters = () => {
    if (!filtersOpen) expand();
    setFiltersOpen(!filtersOpen);
  };
  const resultsList = (
    <div ref={anchor} className="flex flex-col gap-4">
      <PlaceResults
        list={list}
        areas={areas}
        stale={stale}
        onRefreshOrder={refresh}
        hasLayers={results.hasLayers}
        activeSearch={results.activeSearch}
        hasFilters={activeFilters > 0}
        forYou={forYou}
        addresses={results.activeSearch && <AddressResults search={filters.search} />}
      />
      {!list.isLoading && <CreateAreaHint />}
    </div>
  );
  const refreshing = list.isRefreshing || results.isRefreshing;

  if (!isDesktop) {
    return (
      <PanelLayout
        title={title}
        subtitle={scope}
        actions={
          <>
            {refreshing && <Spinner size={16} className="mr-1" />}
            {activeFilters > 0 && (
              <IconButton icon={RotateCcw} label="Сбросить фильтры" onClick={filters.reset} />
            )}
          </>
        }
        toolbar={
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <SearchField onFocus={expand} />
              </div>
              <FiltersToggle open={filtersOpen} count={activeFilters} onToggle={toggleFilters} />
            </div>
          </div>
        }
      >
        <NotesMapLayer />
        <div className="flex flex-col gap-4">
          {filtersOpen && (
            <section
              ref={filtersRef}
              id={FILTERS_ID}
              aria-label="Фильтры"
              className="flex animate-fade-in flex-col gap-4 rounded-card border border-line/70 p-3.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <NotesToggle />
                <HomeChip />
              </div>
              <LayerToggles active={filters.layers} onToggle={filters.toggleLayer} />
              <TrustFilter />
              <QuickFilters layers={filters.layers} category={singleCategory} />
              <CategoryFilter layers={filters.layers} defaultExpanded />
              <Button variant="secondary" block onClick={toggleFilters}>
                {list.total > 0
                  ? `Показать ${pluralize(list.total, PLURALS.place)}`
                  : 'Скрыть фильтры'}
              </Button>
            </section>
          )}
          {resultsList}
        </div>
      </PanelLayout>
    );
  }

  return (
    <PanelLayout
      title="Карта города"
      subtitle="Владивосток глазами жителей"
      actions={
        activeFilters > 0 && (
          <IconButton icon={RotateCcw} label="Сбросить фильтры" onClick={filters.reset} />
        )
      }
      toolbar={
        <div className="flex flex-col gap-3">
          <SearchField />
          <LayerToggles active={filters.layers} onToggle={filters.toggleLayer} />
        </div>
      }
    >
      <NotesMapLayer />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            icon={SlidersHorizontal}
            selected={filtersOpen || activeFilters > 0}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            {filtersOpen ? 'Скрыть фильтры' : 'Фильтры'}
            {activeFilters > 0 && (
              <span className="-mr-1 rounded-full bg-brand px-1.5 text-2xs leading-[18px] font-semibold text-white">
                {activeFilters}
              </span>
            )}
          </Chip>
          <HomeChip />
        </div>
        {filtersOpen && (
          <section
            ref={filtersRef}
            aria-label="Фильтры"
            className="flex flex-col gap-4 rounded-card border border-line bg-surface p-3"
          >
            <TrustFilter />
            <NotesToggle variant="switch" />
            <QuickFilters layers={filters.layers} category={singleCategory} />
            <CategoryFilter layers={filters.layers} />
          </section>
        )}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">
            {title} <span className="font-normal text-ink-soft">{scope}</span>
          </h2>
          {refreshing && <Spinner size={14} />}
        </div>
        {resultsList}
      </div>
    </PanelLayout>
  );
}
