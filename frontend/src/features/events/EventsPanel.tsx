import { CalendarPlus, RotateCcw, SlidersHorizontal, Users } from 'lucide-react';
import { useState } from 'react';

import { useSearchSignal } from '@/features/interests';
import { useMapPlaces } from '@/features/map';
import { useIsDesktop } from '@/shared/hooks';
import { plural, PLURALS } from '@/shared/lib/format';
import { Button, IconButton, PanelLayout, Spinner } from '@/shared/ui';

import { EventsFilters } from './EventsFilters';
import { EventsFiltersSheet } from './EventsFiltersSheet';
import { EventsResults } from './EventsResults';
import { EventsSearch } from './EventsSearch';
import { EventsTopBar, FilterCount } from './EventsTopBar';
import { countActiveFilters, useEventsFilters } from './filtersStore';
import { periodPhrase } from './period';
import { startCreateEvent } from './startCreateEvent';
import { TimeChips } from './TimeChips';
import { useEventsFeed, type EventsFeed } from './useEventsFeed';

function feedTitle(feed: EventsFeed): string {
  if (feed.isLoading) return 'Ищем события…';
  if (feed.isError || !feed.events) return 'Нет связи';
  const count = feed.events.length;
  if (count === 0) return 'Событий нет';
  return `${count}${feed.hasMore ? '+' : ''} ${plural(count, PLURALS.event)}`;
}

/** Desktop: format, source, categories and sorting behind a disclosure. */
function DesktopFilters({ activeFilters }: { activeFilters: number }) {
  return (
    <details className="group rounded-card border border-line/70">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <SlidersHorizontal size={16} aria-hidden className="text-ink-soft" />
          Фильтры и сортировка
          <FilterCount count={activeFilters} />
        </span>
        <span className="text-xs font-normal text-ink-faint group-open:hidden">показать</span>
      </summary>
      <div className="animate-fade-in px-3.5 pt-1 pb-4">
        <EventsFilters />
      </div>
    </details>
  );
}

function CreateActions() {
  return (
    <div className="flex gap-2 max-[379px]:[&_svg]:hidden [&>*]:flex-1 [&>*]:px-3">
      <Button icon={CalendarPlus} onClick={() => startCreateEvent(false)}>
        Создать событие
      </Button>
      <Button variant="secondary" icon={Users} onClick={() => startCreateEvent(true)}>
        Собрать встречу
      </Button>
    </div>
  );
}

/**
 * «Афиша». Imported VL.ru events, residents' events and meetups in one feed; the map shows
 * the same filtered set. Phones: search and period chips float over the map, other filters
 * live in their own sheet. Desktop: everything in the side panel.
 */
export default function EventsPanel() {
  const isDesktop = useIsDesktop();
  const filters = useEventsFilters();
  const feed = useEventsFeed();
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const refreshing = feed.isRefreshing && <Spinner size={16} className="mr-3" />;

  if (!isDesktop) {
    return (
      <>
        <EventsTopBar activeFilters={activeFilters} onOpenFilters={() => setFiltersOpen(true)} />
        <PanelLayout
          title={feedTitle(feed)}
          subtitle={subtitle}
          actions={refreshing}
          footer={<CreateActions />}
        >
          <EventsResults feed={feed} />
        </PanelLayout>
        <EventsFiltersSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          confirmLabel={feed.events?.length ? `Показать ${feedTitle(feed)}` : 'Готово'}
          activeFilters={activeFilters}
        />
      </>
    );
  }

  return (
    <PanelLayout
      title="Афиша"
      subtitle="События города и встречи жителей"
      actions={
        <>
          {feed.isRefreshing && <Spinner size={16} className="mr-1" />}
          {activeFilters > 0 && (
            <IconButton icon={RotateCcw} label="Сбросить фильтры" onClick={filters.reset} />
          )}
        </>
      }
      toolbar={
        <div className="flex flex-col gap-3">
          <EventsSearch />
          <TimeChips className="flex-wrap" />
        </div>
      }
      footer={<CreateActions />}
    >
      <div className="flex flex-col gap-4">
        <DesktopFilters activeFilters={activeFilters} />
        <h2 className="-mb-2 text-sm font-semibold text-ink">
          {feedTitle(feed)} <span className="font-normal text-ink-soft">{subtitle}</span>
        </h2>
        <EventsResults feed={feed} />
      </div>
    </PanelLayout>
  );
}
