import type { AreaHighlight } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { categoryIcon } from '@/shared/lib/categoryIcons';
import { formatNumber } from '@/shared/lib/format';
import { Chip } from '@/shared/ui';

interface AreaHighlightsProps {
  highlights: readonly AreaHighlight[];
  /** Category the list below is filtered by; `null` = everything. */
  selectedId: number | null;
  onSelect: (categoryId: number | null) => void;
}

/** «Что здесь есть»: top categories with counts; a chip filters the list of places. */
export function AreaHighlights({ highlights, selectedId, onSelect }: AreaHighlightsProps) {
  const { byId } = useCategories();
  const known = highlights.filter((item) => byId.has(item.category_id));
  if (known.length === 0) return null;

  return (
    <section aria-label="Что здесь есть">
      <h3 className="mb-2 text-sm font-semibold text-ink">Что здесь есть</h3>
      <div
        data-sheet-ignore
        className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 lg:-mx-5 lg:flex-wrap lg:px-5"
      >
        {known.map(({ category_id: id, count }) => {
          const category = byId.get(id)!;
          const selected = selectedId === id;
          return (
            <Chip
              key={id}
              tone={category.layer}
              icon={categoryIcon(category.slug, category.layer)}
              selected={selected}
              onClick={() => onSelect(selected ? null : id)}
            >
              {category.name}
              <span className="font-semibold tabular-nums">{formatNumber(count)}</span>
            </Chip>
          );
        })}
      </div>
    </section>
  );
}
