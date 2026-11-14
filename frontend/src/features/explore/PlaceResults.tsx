import { ArrowUpDown, Layers, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { AreaListItem, CommunityEventLine } from '@/features/areas';
import { ForYouInvite } from '@/features/interests';
import { useUserLocation } from '@/features/map';
import { PlaceListItem } from '@/features/places';
import type { AreaCard, PlaceCard } from '@/shared/api';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { haversine } from '@/shared/lib/geo';
import { Button, EmptyState, ErrorState, ListSkeleton, StaggerItem } from '@/shared/ui';

import { useExploreFilters } from './filtersStore';
import type { ExploreAreas } from './useExploreAreas';
import type { ExploreList } from './useExploreList';
import type { ForYouMap } from './useForYouMap';

/** How many recommendations lead the list — more would push everything else out of sight. */
const FOR_YOU_LIMIT = 5;

interface PlaceResultsProps {
  list: ExploreList;
  areas: ExploreAreas;
  /** The map moved while the reader was down the list: offer «Обновить порядок». */
  stale: boolean;
  onRefreshOrder: () => void;
  hasLayers: boolean;
  activeSearch: string;
  hasFilters: boolean;
  /** «Для вас»: leads the list, each row marked; the rest follows without repeats. */
  forYou: ForYouMap;
  /** 2GIS address suggestions of a search: shown before the places. */
  addresses?: ReactNode;
}

/** «Сейчас на карте · 3 локации · 12 мест» — a quiet divider between the groups. */
function GroupTitle({ title, areas, places }: { title: string; areas: number; places: number }) {
  const counts = [
    areas > 0 && pluralize(areas, PLURALS.area),
    places > 0 && pluralize(places, PLURALS.place),
  ].filter(Boolean);
  return (
    <h2 className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
      {title}
      <span className="font-normal text-ink-faint">{counts.join(' · ')}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </h2>
  );
}

interface GroupProps {
  title: string;
  areas: readonly AreaCard[];
  places: readonly PlaceCard[];
  /** Places of the group city-wide, loaded or not. */
  placeCount: number;
  distanceTo: (place: PlaceCard) => number | undefined;
  /** Shown right after the first card (the interests invitation). */
  afterFirst?: ReactNode;
}

function Group({ title, areas, places, placeCount, distanceTo, afterFirst }: GroupProps) {
  if (areas.length === 0 && places.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <GroupTitle title={title} areas={areas.length} places={placeCount} />
      {areas.length > 0 && (
        <ul aria-label="Локации" className="flex flex-col gap-2.5">
          {areas.map((area, index) => (
            <StaggerItem key={area.id} index={index}>
              <AreaListItem area={area} />
              {index === 0 && afterFirst && <div className="pt-2.5">{afterFirst}</div>}
            </StaggerItem>
          ))}
        </ul>
      )}
      {places.length > 0 && (
        <ul aria-label="Места" className="flex flex-col gap-2">
          {places.map((place, index) => (
            <StaggerItem key={place.id} index={index}>
              <PlaceListItem place={place} distanceM={distanceTo(place)} />
              {index === 0 && areas.length === 0 && afterFirst && (
                <div className="pt-2">{afterFirst}</div>
              )}
            </StaggerItem>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The list under the map, one for everything and city-wide: what is recommended to the viewer
 * first, then «Сейчас на карте» — the locations and places in the map view — then «Ещё в
 * городе». Within each, locations come first (residents' events on top); places are residents'
 * first, the nearest first. Moving the map only re-sorts: nothing disappears.
 */
export function PlaceResults({
  list,
  areas,
  stale,
  onRefreshOrder,
  hasLayers,
  activeSearch,
  hasFilters,
  forYou,
  addresses,
}: PlaceResultsProps) {
  const reset = useExploreFilters((state) => state.reset);
  const { location } = useUserLocation();
  const leading = forYou.items.slice(0, FOR_YOU_LIMIT);
  const leadingAreas = new Set(leading.map((item) => item.area?.id));
  const leadingPlaces = new Set(leading.map((item) => item.place?.id));
  const distanceTo = (place: PlaceCard) =>
    location ? haversine(location.point, place) : undefined;

  if (!hasLayers) {
    return (
      <EmptyState
        icon={Layers}
        title="Все слои выключены"
        description="Включите хотя бы один слой, чтобы увидеть места."
      />
    );
  }
  if (list.isLoading) return <ListSkeleton rows={5} />;
  if (list.isError) return <ErrorState error={list.error} onRetry={list.refetch} />;

  const inViewPlaces = list.items.slice(0, list.inView).filter((p) => !leadingPlaces.has(p.id));
  const restPlaces = list.items.slice(list.inView).filter((p) => !leadingPlaces.has(p.id));
  const inViewAreas = areas.inView.filter((area) => !leadingAreas.has(area.id));
  const restAreas = areas.rest.filter((area) => !leadingAreas.has(area.id));
  // The rest starts once the places in view are all loaded.
  const restStarted = list.items.length >= list.inView;
  const empty = list.total === 0 && areas.inView.length + areas.rest.length === 0;

  if (empty && leading.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {addresses}
        <EmptyState
          icon={SearchX}
          title="Ничего не нашлось"
          description={
            activeSearch
              ? `По запросу «${activeSearch}» мест нет. Попробуйте другое слово или сбросьте фильтры.`
              : hasFilters
                ? 'Попробуйте ослабить фильтры.'
                : 'Станьте первым, кто добавит место.'
          }
          action={
            hasFilters && (
              <Button variant="secondary" size="sm" onClick={reset}>
                Сбросить фильтры
              </Button>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {stale && (
        <div className="pointer-events-none sticky top-0 z-20 -mb-3 flex justify-center">
          <Button
            size="sm"
            icon={ArrowUpDown}
            onClick={onRefreshOrder}
            className="pointer-events-auto shadow-card"
          >
            Обновить порядок
          </Button>
        </div>
      )}
      {leading.length > 0 && (
        <section aria-label="Для вас">
          <ul className="flex flex-col gap-2.5">
            {leading.map((item, index) => (
              <StaggerItem key={`${item.type}:${item.area?.id ?? item.place?.id}`} index={index}>
                {item.area ? (
                  <AreaListItem area={item.area} event={item.reason_event} />
                ) : (
                  item.place && (
                    <div className="flex flex-col gap-1.5">
                      <PlaceListItem place={item.place} forYou />
                      {/* A venue raised for a residents' event there: name the event. */}
                      {item.reason_event && (
                        <CommunityEventLine event={item.reason_event} className="px-3" />
                      )}
                    </div>
                  )
                )}
              </StaggerItem>
            ))}
          </ul>
        </section>
      )}
      {addresses}
      <Group
        title="Сейчас на карте"
        areas={inViewAreas}
        places={inViewPlaces}
        placeCount={list.inView}
        distanceTo={distanceTo}
        // After the first card, so the half-open sheet on a phone still shows a card.
        afterFirst={forYou.invite && <ForYouInvite />}
      />
      {forYou.invite && inViewAreas.length + inViewPlaces.length === 0 && <ForYouInvite />}
      {restStarted && (
        <Group
          title={activeSearch ? 'Ещё нашлось' : 'Ещё в городе'}
          areas={restAreas}
          places={restPlaces}
          placeCount={list.total - list.inView}
          distanceTo={distanceTo}
        />
      )}
      {list.hasMore && (
        <Button variant="secondary" block loading={list.isLoadingMore} onClick={list.loadMore}>
          Показать ещё
        </Button>
      )}
    </div>
  );
}
