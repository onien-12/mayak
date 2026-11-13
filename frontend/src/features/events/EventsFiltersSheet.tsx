import { Button, Modal } from '@/shared/ui';

import { EventsFilters } from './EventsFilters';
import { useEventsFilters } from './filtersStore';

interface EventsFiltersSheetProps {
  open: boolean;
  onClose: () => void;
  /** Confirm button with the result count («Показать 18 событий»). */
  confirmLabel: string;
  activeFilters: number;
}

/** Phone: format, source, categories and sorting in one bottom sheet. */
export function EventsFiltersSheet({
  open,
  onClose,
  confirmLabel,
  activeFilters,
}: EventsFiltersSheetProps) {
  const reset = useEventsFilters((state) => state.reset);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Фильтры афиши"
      footer={
        <>
          <Button variant="secondary" onClick={reset} disabled={activeFilters === 0}>
            Сбросить
          </Button>
          <Button onClick={onClose}>{confirmLabel}</Button>
        </>
      }
    >
      <EventsFilters />
    </Modal>
  );
}
