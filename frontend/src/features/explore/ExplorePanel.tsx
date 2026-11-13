import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { CreateAreaHint, useMapAreas } from '@/features/areas';
import { useSearchSignal } from '@/features/interests';
import { useMapPlaces } from '@/features/map';
import { NotesMapLayer, NotesToggle } from '@/features/spot';
import { useCategories, useIsDesktop } from '@/shared/hooks';
import { pluralize, PLURALS } from '@/shared/lib/format';
import {
  Chip,
  IconButton,
  PanelLayout,
  Spinner,
  useOfferAddPlace,
  usePanelSection,
} from '@/shared/ui';

import { AddressResults } from './AddressResults';
import { CategoryFilter } from './CategoryFilter';
import { ExploreTopBar } from './ExploreTopBar';
import { FiltersSheet } from './FiltersSheet';
import { HomeChip } from './HomeChip';
import { countActiveFilters, useExploreFilters } from './filtersStore';
import { LayerToggles } from './LayerToggles';
import { PlaceResults } from './PlaceResults';
import { QuickFilters } from './QuickFilters';
import { SearchField } from './SearchField';
import { TrustFilter } from './TrustFilter';
import { useExploreAreas, type ExploreAreas } from './useExploreAreas';
import { useExplorePlaces, type ExploreResults } from './useExplorePlaces';
import { useForYouMap } from './useForYouMap';

/** «5 локаций · 12 мест» — what the list below holds. */
function resultsTitle(results: ExploreResults, areas: ExploreAreas): string {
  if (!results.hasLayers) return 'Слои выключены';
  if (results.isLoading) return 'Ищем места…';
  if (results.isError) return 'Нет связи';
  const parts = [
    areas.visibleAreas.length > 0 && pluralize(areas.visibleAreas.length, PLURALS.area),
    areas.listedPlaces.length > 0 && pluralize(areas.listedPlaces.length, PLURALS.place),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Здесь пока пусто';
}

/**
 * «Карта». Phones: search pill and quick filters float over the map, the sheet holds the
 * list of places in the viewport, the rest of the filters live in their own sheet.
 * Desktop: search, layers and the list in the side panel; the other filters unfold from
 * the «Фильтры» chip, so the list starts right under the layers.
 */
export function ExplorePanel() {
  const isDesktop = useIsDesktop();
  const filters = useExploreFilters();
  const results = useExplorePlaces();
  const areas = useExploreAreas(results.nearby, results.activeSearch);
  const { byId } = useCategories();
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    ? `по запросу «${results.activeSearch}»`
    : 'в этой области · сначала от жителей, ближние выше';

  // «Для вас» leads the list (SPEC §23.5); a text search makes the list about the query instead.
  const forYou = useForYouMap({
    hidden: results.activeSearch !== '',
    areasShown: areas.fold !== undefined,
  });
  const resultsList = (
    <div className="flex flex-col gap-4">
      <PlaceResults
        results={results}
        areas={areas}
        hasFilters={activeFilters > 0}
        forYou={forYou}
        addresses={results.activeSearch && <AddressResults search={filters.search} />}
      />
      {!results.isLoading && <CreateAreaHint />}
    </div>
  );

  if (!isDesktop) {
    return (
      <>
        <ExploreTopBar activeFilters={activeFilters} onOpenFilters={() => setFiltersOpen(true)} />
        <NotesMapLayer />
        <PanelLayout
          title={resultsTitle(results, areas)}
          subtitle={scope}
          actions={results.isRefreshing && <Spinner size={16} className="mr-3" />}
        >
          {resultsList}
        </PanelLayout>
        <FiltersSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          category={singleCategory}
          resultCount={results.nearby.length}
          activeFilters={activeFilters}
        />
      </>
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
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-3">
            <TrustFilter />
            <NotesToggle variant="switch" />
            <QuickFilters layers={filters.layers} category={singleCategory} />
            <CategoryFilter layers={filters.layers} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">
            {resultsTitle(results, areas)}{' '}
            <span className="font-normal text-ink-soft">{scope}</span>
          </h2>
          {results.isRefreshing && <Spinner size={14} />}
        </div>
        {resultsList}
      </div>
    </PanelLayout>
  );
}
