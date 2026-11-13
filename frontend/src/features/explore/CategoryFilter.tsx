import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { Category, Layer } from '@/shared/api';
import { useLayerCategories } from '@/shared/hooks';
import { categoryIcon, groupCategories } from '@/shared/lib/categoryIcons';
import { cn } from '@/shared/lib/cn';
import { LAYER_META } from '@/shared/lib/labels';
import { Chip } from '@/shared/ui';

import { useExploreFilters } from './filtersStore';

interface CategoryFilterProps {
  layers: readonly Layer[];
  defaultExpanded?: boolean;
}

/** Category chips of the active layers, grouped by the catalog `group`. Collapsed by default. */
export function CategoryFilter({ layers, defaultExpanded = false }: CategoryFilterProps) {
  const categories = useLayerCategories(layers);
  const selectedIds = useExploreFilters((state) => state.categoryIds);
  const toggleCategory = useExploreFilters((state) => state.toggleCategory);
  const retainCategories = useExploreFilters((state) => state.retainCategories);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const groups = useMemo(() => groupCategories(categories), [categories]);
  const selected = categories.filter((category) => selectedIds.includes(category.id));

  useEffect(() => {
    if (categories.length > 0) retainCategories(categories.map((category) => category.id));
  }, [categories, retainCategories]);

  if (categories.length === 0) return null;

  const chip = (category: Category) => (
    <Chip
      key={category.id}
      tone={LAYER_META[category.layer].tone}
      icon={categoryIcon(category.slug, category.layer)}
      selected={selectedIds.includes(category.id)}
      onClick={() => toggleCategory(category.id)}
    >
      {category.name}
    </Chip>
  );

  return (
    <section>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex h-11 w-full items-center justify-between text-sm font-semibold text-ink lg:h-9"
      >
        <span>
          Категории
          {selected.length > 0 && (
            <span className="ml-2 rounded-full bg-brand px-1.5 py-0.5 text-2xs font-semibold text-white">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className={cn(
            'text-ink-faint transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {!expanded && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">{selected.map(chip)}</div>
      )}

      {expanded && (
        <div className="flex animate-fade-in flex-col gap-3 pt-1">
          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="mb-1.5 text-xs text-ink-faint">{group}</p>
              <div className="flex flex-wrap gap-1.5">{items.map(chip)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
