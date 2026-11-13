import { useState } from 'react';

import { Button, Field, Input, Modal } from '@/shared/ui';

import type { DayRange } from './filtersStore';
import { toDayValue } from './period';

interface DateRangeDialogProps {
  open: boolean;
  onClose: () => void;
  initial: DayRange | null;
  onApply: (range: DayRange) => void;
}

function defaultRange(): DayRange {
  const today = toDayValue(new Date());
  return { from: today, to: today };
}

/** Custom period of the afisha: two native date inputs (the best picker on phones). */
export function DateRangeDialog({ open, onClose, initial, onApply }: DateRangeDialogProps) {
  const [range, setRange] = useState<DayRange>(() => initial ?? defaultRange());
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRange(initial ?? defaultRange());
  }
  const invalid = !range.from || !range.to || range.to < range.from;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Выбрать даты"
      description="Покажем события, которые идут хотя бы один день из выбранных."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={invalid}
            onClick={() => {
              onApply(range);
              onClose();
            }}
          >
            Показать
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="С" htmlFor="events-from">
          <Input
            id="events-from"
            type="date"
            value={range.from}
            onChange={(event) => {
              const from = event.target.value;
              setRange({ from, to: range.to < from ? from : range.to });
            }}
          />
        </Field>
        <Field
          label="По"
          htmlFor="events-to"
          error={range.to && range.to < range.from ? 'Раньше начала' : undefined}
        >
          <Input
            id="events-to"
            type="date"
            min={range.from}
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
