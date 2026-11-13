import { SlidersHorizontal } from 'lucide-react';
import { memo, type ReactNode } from 'react';

import type { Layer } from '@/shared/api';
import { useLayerCategories } from '@/shared/hooks';
import { categoryIcon } from '@/shared/lib/categoryIcons';
import { ISSUE_STAGE_META, ISSUE_STAGES } from '@/shared/lib/labels';
import { Chip } from '@/shared/ui';

import { countProblemFilters, useProblemFilters } from './filtersStore';

const ISSUE_LAYERS: readonly Layer[] = ['issue'];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Category and stage of residents' problems behind a disclosure, folded by default like the
 * filters of «События». Memoised: the panel re-renders with every viewport change.
 */
export const ProblemsFilters = memo(function ProblemsFilters() {
  const filters = useProblemFilters();
  const categories = useLayerCategories(ISSUE_LAYERS);
  const active = countProblemFilters(filters);

  return (
    <details className="group rounded-card border border-line/70">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <SlidersHorizontal size={16} aria-hidden className="text-ink-soft" />
          Фильтры
          {active > 0 && (
            <span className="rounded-full bg-brand px-1.5 text-2xs leading-[18px] font-semibold text-white">
              {active}
            </span>
          )}
        </span>
        <span className="text-xs font-normal text-ink-faint group-open:hidden">показать</span>
      </summary>
      <div className="flex animate-fade-in flex-col gap-5 px-3.5 pt-1 pb-4">
        {categories.length > 0 && (
          <Group title="Категории">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <Chip
                  key={category.id}
                  tone="issue"
                  icon={categoryIcon(category.slug, category.layer)}
                  selected={filters.categoryIds.includes(category.id)}
                  onClick={() => filters.toggleCategory(category.id)}
                >
                  {category.name}
                </Chip>
              ))}
            </div>
          </Group>
        )}
        <Group title="Этап">
          <div className="flex flex-wrap gap-1.5">
            {ISSUE_STAGES.map((stage) => {
              const meta = ISSUE_STAGE_META[stage];
              return (
                <Chip
                  key={stage}
                  tone={meta.tone}
                  icon={meta.icon}
                  selected={filters.stages.includes(stage)}
                  onClick={() => filters.toggleStage(stage)}
                >
                  {meta.label}
                </Chip>
              );
            })}
          </div>
        </Group>
      </div>
    </details>
  );
});
