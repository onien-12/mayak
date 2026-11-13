import { useMemo } from 'react';

import type { Category, Layer } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { groupCategories } from '@/shared/lib/categoryIcons';
import { cn } from '@/shared/lib/cn';
import { CategoryIcon, ErrorState, Skeleton } from '@/shared/ui';

interface CategoryStepProps {
  layer: Layer;
  selectedId?: number;
  onPick: (category: Category) => void;
}

/** Step 2: category of the chosen layer, grouped as in the catalog. */
export function CategoryStep({ layer, selectedId, onPick }: CategoryStepProps) {
  const { categories, isLoading, isError, refetch } = useCategories();
  const groups = useMemo(
    () => groupCategories(categories.filter((category) => category.layer === layer)),
    [categories, layer],
  );

  if (isLoading) return <Skeleton className="h-64 rounded-card" />;
  if (isError)
    return <ErrorState title="Не удалось загрузить категории" onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([group, items]) => (
        <section key={group}>
          {groups.length > 1 && (
            <h2 className="mb-2 text-xs font-medium text-ink-faint">{group}</h2>
          )}
          <div className="grid grid-cols-2 gap-2">
            {items.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={category.id === selectedId}
                onClick={() => onPick(category)}
                className={cn(
                  'flex min-h-14 items-center gap-2.5 rounded-control border bg-surface p-2 text-left text-sm leading-tight font-medium text-ink transition-[border-color,transform] duration-150 active:scale-[0.97]',
                  category.id === selectedId
                    ? 'border-brand'
                    : 'border-line hover:border-ink-faint/60',
                )}
              >
                <CategoryIcon slug={category.slug} layer={layer} size={36} />
                <span className="min-w-0 flex-1">{category.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
