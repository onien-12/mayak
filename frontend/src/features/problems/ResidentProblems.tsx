import { Megaphone, SearchX } from 'lucide-react';
import { useState } from 'react';

import { PlaceListItem } from '@/features/places';
import type { PlaceCard } from '@/shared/api';
import { formatRelative, pluralize, PLURALS } from '@/shared/lib/format';
import { Button, EmptyState, ErrorState, ListSkeleton, StaggerItem } from '@/shared/ui';

import { countProblemFilters, useProblemFilters } from './filtersStore';
import { ProblemsFilters } from './ProblemsFilters';
import { startReportProblem } from './startReportProblem';
import { lastActivity, type ResidentProblems as Problems } from './useResidentProblems';

const PAGE_SIZE = 20;

/** «подтвердили вчера» / «сообщили 3 дня назад». */
function freshness(place: PlaceCard): string {
  const confirmed = lastActivity(place) !== place.created_at;
  return `${confirmed ? 'подтвердили' : 'сообщили'} ${formatRelative(lastActivity(place))}`;
}

function Empty() {
  const filters = useProblemFilters();
  if (countProblemFilters(filters) > 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Таких проблем здесь нет"
        description="Уберите часть фильтров или сдвиньте карту."
        action={
          <Button variant="secondary" size="sm" onClick={filters.reset}>
            Сбросить фильтры
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Megaphone}
      title="Здесь жители пока ни о чём не сообщали"
      description="Яма во дворе, свалка, сломанный фонарь? Расскажите — соседи подтвердят, и решить проблему будет проще."
      action={
        <Button size="sm" icon={Megaphone} onClick={startReportProblem}>
          Сообщить о проблеме
        </Button>
      }
    />
  );
}

/**
 * «От жителей»: problems residents reported in the visible part of the map — open and fresh
 * ones first, solved ones at the end. A row opens the usual place card.
 */
export function ResidentProblems({ problems }: { problems: Problems }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { visible } = problems;

  return (
    <section aria-label="Проблемы от жителей" className="flex flex-col gap-3">
      <h2 className="-mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
        От жителей
        {visible && visible.length > 0 && (
          <span className="text-xs font-normal text-ink-faint">
            {pluralize(visible.length, PLURALS.issue)} в этой части карты
          </span>
        )}
      </h2>
      <ProblemsFilters />
      {problems.isPending ? (
        <ListSkeleton rows={3} />
      ) : problems.isError || !visible ? (
        <ErrorState error={problems.error} onRetry={() => void problems.refetch()} />
      ) : visible.length === 0 ? (
        <Empty />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.slice(0, limit).map((place, index) => (
            <StaggerItem key={place.id} index={index}>
              <PlaceListItem place={place} note={freshness(place)} />
            </StaggerItem>
          ))}
        </ul>
      )}
      {visible && visible.length > limit && (
        <Button variant="secondary" block onClick={() => setLimit(limit + PAGE_SIZE)}>
          Показать ещё
        </Button>
      )}
    </section>
  );
}
