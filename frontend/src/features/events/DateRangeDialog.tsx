import { useState } from 'react';

import { Button, Chip, Field, Input, Modal } from '@/shared/ui';

import type { DayRange, TimePreset } from './filtersStore';
import { RANGE_PRESETS, toDayValue } from './period';

interface DateRangeDialogProps {
  open: boolean;
  onClose: () => void;
  initial: DayRange | null;
  onApply: (range: DayRange) => void;
  /** The current period, to mark a chosen preset. */
  time: TimePreset;
  onPreset: (preset: Exclude<TimePreset, 'custom'>) => void;
}

function defaultRange(): DayRange {
  const today = toDayValue(new Date());
  return { from: today, to: today };
}

/** Period beyond the quick chips: ready presets, or two native date inputs (the best picker on phones). */
export function DateRangeDialog({
  open,
  onClose,
  initial,
  onApply,
  time,
  onPreset,
}: DateRangeDialogProps) {
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
      <div role="group" aria-label="Готовые периоды" className="mb-4 flex flex-wrap gap-2">
        {RANGE_PRESETS.map((preset) => (
          <Chip
            key={preset.value}
            tone="event"
            selected={time === preset.value}
            onClick={() => {
              onPreset(preset.value);
              onClose();
            }}
          >
            {preset.label}
          </Chip>
        ))}
      </div>
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
