import { useMemo } from 'react';

import { useMapRecommendedAreas } from '@/features/areas';
import { useRecommendations } from '@/features/interests';
import { useMapRecommended, useMapViewport } from '@/features/map';
import type { AreaCard, PlaceCard, Recommendation } from '@/shared/api';
import { boundsToBbox, snapBoundsOutward } from '@/shared/lib/geo';

import { useExploreFilters } from './filtersStore';

const NO_ITEMS: readonly Recommendation[] = [];

interface ForYouMapOptions {
  /** A text search is active: the list is about the query, «Для вас» steps aside. */
  hidden: boolean;
  /** Areas are shown on the map right now (no filter that areas cannot represent). */
  areasShown: boolean;
}

export interface ForYouMap {
  /** Recommended locations and places in view, best first, as the filters allow them. */
  items: readonly Recommendation[];
  /** The viewer has no interest profile yet — offer to pick interests instead. */
  invite: boolean;
}

/**
 * «Для вас» of the map section (SPEC §23.5): recommended locations and places in the visible
 * part of the map. They lead the general list of the panel, marked «для вас»; on the map the
 * same objects get a quiet accent and stay visible when zoomed out.
 */
export function useForYouMap({ hidden, areasShown }: ForYouMapOptions): ForYouMap {
  const viewport = useMapViewport();
  const layers = useExploreFilters((state) => state.layers);
  const categoryIds = useExploreFilters((state) => state.categoryIds);
  const bbox = viewport ? boundsToBbox(snapBoundsOutward(viewport.bounds)) : undefined;
  const query = useRecommendations(
    { scope: 'map', bbox },
    { enabled: !hidden && bbox !== undefined },
  );
  const data = hidden ? undefined : query.data;

  // The map follows the filters: a hidden layer or another category is not drawn for «Для вас».
  const all = data?.personalized ? data.items : NO_ITEMS;
  const items = useMemo(
    () =>
      all.filter((item) =>
        item.type === 'area'
          ? areasShown && item.area !== null
          : item.place !== null &&
            layers.includes(item.place.layer) &&
            (categoryIds.length === 0 || categoryIds.includes(item.place.category_id)),
      ),
    [all, areasShown, layers, categoryIds],
  );
  const mapAreas = useMemo(
    () =>
      items.flatMap((item): AreaCard[] => (item.type === 'area' && item.area ? [item.area] : [])),
    [items],
  );
  const mapPlaces = useMemo(
    () =>
      items.flatMap((item): PlaceCard[] =>
        item.type === 'place' && item.place ? [item.place] : [],
      ),
    [items],
  );
  useMapRecommendedAreas(mapAreas);
  useMapRecommended(mapPlaces);

  return { items, invite: data !== undefined && !data.personalized };
}
