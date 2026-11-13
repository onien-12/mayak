import { AnimatePresence, motion } from 'motion/react';

import { PlaceListItem } from '@/features/places';
import type { Category, PlaceCard } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { formatNumber } from '@/shared/lib/format';
import { CategoryIcon, StaggerItem, TWEEN } from '@/shared/ui';

interface PlaceGroup {
  category: Category;
  places: PlaceCard[];
}

/** Places grouped by category, the biggest groups first. */
function groupByCategory(
  places: readonly PlaceCard[],
  byId: ReadonlyMap<number, Category>,
): PlaceGroup[] {
  const groups = new Map<number, PlaceGroup>();
  for (const place of places) {
    const category = byId.get(place.category_id);
    if (!category) continue;
    const group = groups.get(category.id);
    if (group) group.places.push(place);
    else groups.set(category.id, { category, places: [place] });
  }
  return [...groups.values()].sort((a, b) => b.places.length - a.places.length);
}

interface AreaPlacesProps {
  places: readonly PlaceCard[];
  /** Show only this category (from the highlight chips). */
  categoryId: number | null;
}

/** The places of an area, grouped by category; switching the filter re-staggers the list. */
export function AreaPlaces({ places, categoryId }: AreaPlacesProps) {
  const { byId } = useCategories();
  const shown = categoryId === null ? places : places.filter((p) => p.category_id === categoryId);
  const groups = groupByCategory(shown, byId);
  let index = 0;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={categoryId ?? 'all'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={TWEEN.fast}
        className="flex flex-col gap-5"
      >
        {groups.map(({ category, places: items }) => (
          <section key={category.id} aria-label={category.name}>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <CategoryIcon slug={category.slug} layer={category.layer} size={26} />
              {category.name}
              <span className="font-normal text-ink-faint">{formatNumber(items.length)}</span>
            </h4>
            <ul className="flex flex-col gap-2">
              {items.map((place) => (
                <StaggerItem key={place.id} index={index++}>
                  <PlaceListItem place={place} hideArea />
                </StaggerItem>
              ))}
            </ul>
          </section>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
