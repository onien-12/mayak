import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { useSearchSignal } from '@/features/interests';
import { useMapPlaces } from '@/features/map';
import { useIsDesktop, useRevealOnOpen } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { plural, PLURALS } from '@/shared/lib/format';
import { Button, IconButton, PanelLayout, Spinner, usePanelStore } from '@/shared/ui';

import { CreateMenu } from './CreateMenu';
import { EventsFilters } from './EventsFilters';
import { EventsResults } from './EventsResults';
import { EventsSearch } from './EventsSearch';
import { countActiveFilters, useEventsFilters } from './filtersStore';
import { periodPhrase } from './period';
import { TimeChips } from './TimeChips';
import { useEventsFeed, type EventsFeed } from './useEventsFeed';

const FILTERS_ID = 'events-filters';

function feedTitle(feed: EventsFeed): string {
  if (feed.isLoading) return 'Ищем события…';
  if (feed.isError || !feed.events) return 'Нет связи';
  const count = feed.events.length;
  if (count === 0) return 'Событий нет';
  return `${count}${feed.hasMore ? '+' : ''} ${plural(count, PLURALS.event)}`;
}

/** Number of active filters on the «Фильтры» control. */
function FilterCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded-full bg-brand px-1.5 text-2xs leading-[18px] font-semibold text-white">
      {count}
    </span>
  );
}

interface FiltersToggleProps {
  open: boolean;
  count: number;
  onToggle: () => void;
}

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
      <FilterCount count={count} />
      <ChevronDown
        size={16}
        aria-hidden
        className={cn('text-ink-faint transition-transform duration-200', open && 'rotate-180')}
      />
    </Button>
  );
}

/**
 * «События». Residents' own events and meetups come first — that is the default view; the
 * imported city listings (VL.ru) are one filter away. The map shows the same filtered set.
 * One layout for phones and desktop: search, the «Фильтры» toggle and the period chips sit in
 * the panel above the list they filter — nothing floats over the map; the other filters open at
 * the top of the list.
 */
export default function EventsPanel() {
  const isDesktop = useIsDesktop();
  const setSnap = usePanelStore((state) => state.setSnap);
  const filters = useEventsFilters();
  const feed = useEventsFeed();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRevealOnOpen<HTMLElement>(filtersOpen);
  useMapPlaces(feed.events);
  useSearchSignal(filters.search);

  const activeFilters = countActiveFilters(filters);
  const subtitle = [
    filters.past ? 'прошедшие' : (periodPhrase(filters) ?? 'ближайшие'),
    filters.radiusKm !== null && `в радиусе ${filters.radiusKm} км`,
    feed.activeSearch && `«${feed.activeSearch}»`,
  ]
    .filter(Boolean)
    .join(' · ');
  // Phones: the sheet scrolls only at full height, and the keyboard needs the room anyway.
  const expand = () => {
    if (!isDesktop) setSnap('full');
  };
  const toggleFilters = () => {
    if (!filtersOpen) expand();
    setFiltersOpen(!filtersOpen);
  };

  return (
    <PanelLayout
      // Phones: the count is the title — it is what the half-open sheet has room for.
      title={isDesktop ? 'События' : feedTitle(feed)}
      subtitle={isDesktop ? 'Встречи и события, которые устраивают жители' : subtitle}
      actions={
        <>
          {feed.isRefreshing && <Spinner size={16} className="mr-1" />}
          {activeFilters > 0 && (
            <IconButton icon={RotateCcw} label="Сбросить фильтры" onClick={filters.reset} />
          )}
        </>
      }
      toolbar={
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <EventsSearch onFocus={expand} />
            </div>
            <FiltersToggle open={filtersOpen} count={activeFilters} onToggle={toggleFilters} />
          </div>
          {/* Phones: one row that scrolls sideways; the desktop panel has room to wrap. */}
          <TimeChips className={isDesktop ? 'flex-wrap' : '-mx-4 px-4 [&>*]:h-9'} />
        </div>
      }
      footer={<CreateMenu />}
    >
      <div className="flex flex-col gap-4">
        {filtersOpen && (
          <section
            ref={filtersRef}
            id={FILTERS_ID}
            aria-label="Фильтры и сортировка"
            className="animate-fade-in rounded-card border border-line/70 p-3.5"
          >
            <EventsFilters />
            <Button variant="secondary" block className="mt-4" onClick={toggleFilters}>
              {feed.events?.length ? `Показать ${feedTitle(feed)}` : 'Скрыть фильтры'}
            </Button>
          </section>
        )}
        {isDesktop && (
          <h2 className="-mb-2 text-sm font-semibold text-ink">
            {feedTitle(feed)} <span className="font-normal text-ink-soft">{subtitle}</span>
          </h2>
        )}
        <EventsResults feed={feed} />
      </div>
    </PanelLayout>
  );
}
