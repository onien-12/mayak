import type { Category } from '@/shared/api';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { Button, Modal } from '@/shared/ui';

import { CategoryFilter } from './CategoryFilter';
import { useExploreFilters } from './filtersStore';
import { LayerToggles } from './LayerToggles';
import { QuickFilters } from './QuickFilters';
import { TrustFilter } from './TrustFilter';

interface FiltersSheetProps {
  open: boolean;
  onClose: () => void;
  category: Category | undefined;
  /** Number of places matching the current filters. */
  resultCount: number;
  activeFilters: number;
}

/** Phone: all filters in one bottom sheet, with the result count on the confirm button. */
export function FiltersSheet({
  open,
  onClose,
  category,
  resultCount,
  activeFilters,
}: FiltersSheetProps) {
  const layers = useExploreFilters((state) => state.layers);
  const toggleLayer = useExploreFilters((state) => state.toggleLayer);
  const reset = useExploreFilters((state) => state.reset);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Фильтры"
      footer={
        <>
          <Button variant="secondary" onClick={reset} disabled={activeFilters === 0}>
            Сбросить
          </Button>
          <Button onClick={onClose}>Показать {pluralize(resultCount, PLURALS.place)}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Слои карты</h3>
          <LayerToggles active={layers} onToggle={toggleLayer} />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Насколько проверено</h3>
          <TrustFilter />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Условия</h3>
          <QuickFilters layers={layers} category={category} />
        </section>
        <CategoryFilter layers={layers} defaultExpanded />
      </div>
    </Modal>
  );
}
