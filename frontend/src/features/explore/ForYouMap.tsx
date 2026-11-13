import { useMemo } from 'react';

import { AreaThumb, useMapRecommendedAreas } from '@/features/areas';
import { ForYouCard, ForYouStrip, useRecommendations } from '@/features/interests';
import { useAreaParam, useMapRecommended, useMapViewport, usePlaceParam } from '@/features/map';
import type { AreaCard, PlaceCard, Recommendation } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { boundsToBbox, snapBoundsOutward } from '@/shared/lib/geo';
import { AREA_KIND_META } from '@/shared/lib/labels';
import { PlacePhoto } from '@/shared/ui';

import { useExploreFilters } from './filtersStore';

const NO_AREAS: readonly AreaCard[] = [];
const NO_PLACES: readonly PlaceCard[] = [];

const itemKey = (item: Recommendation) =>
  `${item.type}:${item.area?.id ?? item.place?.id ?? 'none'}`;

interface ForYouMapProps {
  /** A text search is active: the list is about the query, «Для вас» steps aside. */
  hidden: boolean;
  /** Areas are shown on the map right now (no filter that areas cannot represent). */
  areasShown: boolean;
}

/**
 * «Для вас» of the map section (SPEC §23.5): the first block of the explore panel, cards of
 * recommended locations and places in the visible part of the map with their reasons; on the
 * map the same objects get a quiet accent and stay visible when zoomed out. The general list
 * below stays complete.
 */
export function ForYouMap({ hidden, areasShown }: ForYouMapProps) {
  const viewport = useMapViewport();
  const layers = useExploreFilters((state) => state.layers);
  const categoryIds = useExploreFilters((state) => state.categoryIds);
  const { byId } = useCategories();
  const { openArea } = useAreaParam();
  const { openPlace } = usePlaceParam();
  const bbox = viewport ? boundsToBbox(snapBoundsOutward(viewport.bounds)) : undefined;
  const query = useRecommendations(
    { scope: 'map', bbox },
    { enabled: !hidden && bbox !== undefined },
  );
  const data = hidden ? undefined : query.data;

  // The map follows the filters: a hidden layer or another category is not drawn for «Для вас».
  const items = data?.items;
  const mapAreas = useMemo(
    () =>
      areasShown && items
        ? items.flatMap((item) => (item.type === 'area' && item.area ? [item.area] : []))
        : NO_AREAS,
    [items, areasShown],
  );
  const mapPlaces = useMemo(
    () =>
      items
        ? items.flatMap((item) =>
            item.type === 'place' &&
            item.place &&
            layers.includes(item.place.layer) &&
            (categoryIds.length === 0 || categoryIds.includes(item.place.category_id))
              ? [item.place]
              : [],
          )
        : NO_PLACES,
    [items, layers, categoryIds],
  );
  useMapRecommendedAreas(mapAreas);
  useMapRecommended(mapPlaces);

  return (
    <ForYouStrip
      recommendations={data}
      itemKey={itemKey}
      renderCard={(item) => {
        if (item.type === 'area' && item.area) {
          const area = item.area;
          return (
            <ForYouCard
              cover={<AreaThumb area={area} />}
              eyebrow={AREA_KIND_META[area.kind].label}
              title={area.title}
              reasons={item.topics}
              onOpen={() => openArea(area.id)}
            />
          );
        }
        if (item.type === 'place' && item.place) {
          const place = item.place;
          const category = byId.get(place.category_id);
          return (
            <ForYouCard
              cover={
                <PlacePhoto
                  src={place.cover_url}
                  credit={place.cover_credit}
                  layer={place.layer}
                  slug={category?.slug}
                  alt={place.title}
                  className="size-full"
                />
              }
              eyebrow={[category?.name, place.area?.title].filter(Boolean).join(' · ')}
              title={place.title}
              reasons={item.topics}
              onOpen={() => openPlace(place.id)}
            />
          );
        }
        return null;
      }}
    />
  );
}
