import { Layers, MapPinOff, SearchX } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { AreaListItem, CommunityEventLine } from '@/features/areas';
import { ForYouInvite } from '@/features/interests';
import { PlaceListItem } from '@/features/places';
import { Button, EmptyState, ErrorState, ListSkeleton, StaggerItem } from '@/shared/ui';

import { useExploreFilters } from './filtersStore';
import type { ExploreAreas } from './useExploreAreas';
import type { ExploreResults } from './useExplorePlaces';
import type { ForYouMap } from './useForYouMap';

const PAGE_SIZE = 40;
/** How many recommendations lead the list — more would push everything else out of sight. */
const FOR_YOU_LIMIT = 5;

interface PlaceResultsProps {
  results: ExploreResults;
  areas: ExploreAreas;
  hasFilters: boolean;
  /** «Для вас»: leads the list, each row marked; the rest follows without repeats. */
  forYou: ForYouMap;
  /** 2GIS address suggestions of a search: shown after the areas, before the places. */
  addresses?: ReactNode;
}

/**
 * The list under the map, one for everything: what is recommended to the viewer first,
 * then areas (richer cards: those with residents' upcoming events on top, then the most
 * interesting), then the places that are not folded into them (residents' first, nearest
 * first within); loading, empty and error states.
 */
export function PlaceResults({ results, areas, hasFilters, forYou, addresses }: PlaceResultsProps) {
  const reset = useExploreFilters((state) => state.reset);
  const { activeSearch } = results;
  const leading = forYou.items.slice(0, FOR_YOU_LIMIT);
  const leadingAreas = new Set(leading.map((item) => item.area?.id));
  const leadingPlaces = new Set(leading.map((item) => item.place?.id));
  const visibleAreas = areas.visibleAreas.filter((area) => !leadingAreas.has(area.id));
  const nearby = areas.listedPlaces.filter(({ place }) => !leadingPlaces.has(place.id));

  if (!results.hasLayers) {
    return (
      <EmptyState
        icon={Layers}
        title="Все слои выключены"
        description="Включите хотя бы один слой, чтобы увидеть места на карте."
      />
    );
  }
  if (results.isLoading) return <ListSkeleton rows={5} />;
  if (results.isError)
    return <ErrorState error={results.error} onRetry={() => void results.refetch()} />;

  if (nearby.length === 0 && visibleAreas.length === 0 && leading.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {addresses}
        <EmptyState
          icon={activeSearch ? SearchX : MapPinOff}
          title={activeSearch ? 'Ничего не нашлось' : 'В этой области пока пусто'}
          description={
            activeSearch
              ? `По запросу «${activeSearch}» мест нет. Попробуйте другое слово или сбросьте фильтры.`
              : hasFilters
                ? 'Попробуйте ослабить фильтры или подвиньте карту.'
                : 'Подвиньте карту или станьте первым, кто добавит сюда место.'
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
    <div className="flex flex-col gap-4">
      {forYou.invite && <ForYouInvite />}
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
      {visibleAreas.length > 0 && (
        <section aria-label="Локации">
          <ul className="flex flex-col gap-2.5">
            {visibleAreas.map((area, index) => (
              <StaggerItem key={area.id} index={index}>
                <AreaListItem area={area} />
              </StaggerItem>
            ))}
          </ul>
        </section>
      )}
      {addresses}
      {nearby.length > 0 && <PlaceList nearby={nearby} />}
    </div>
  );
}

function PlaceList({ nearby }: { nearby: ExploreAreas['listedPlaces'] }) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  return (
    <section aria-label="Места">
      <ul className="flex flex-col gap-2">
        {nearby.slice(0, limit).map(({ place, distanceM }, index) => (
          <StaggerItem key={place.id} index={index}>
            <PlaceListItem place={place} distanceM={distanceM} />
          </StaggerItem>
        ))}
      </ul>
      {nearby.length > limit && (
        <Button
          variant="secondary"
          block
          className="mt-3"
          onClick={() => setLimit(limit + PAGE_SIZE)}
        >
          Показать ещё
        </Button>
      )}
    </section>
  );
}
