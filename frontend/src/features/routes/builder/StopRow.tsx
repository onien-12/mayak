import {
  CornerDownRight,
  GripVertical,
  Image as ImageIcon,
  Link2,
  Plus,
  Signpost,
  X,
} from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import type { PointerEvent } from 'react';

import { cn } from '@/shared/lib/cn';
import { formatDistance, formatDuration } from '@/shared/lib/format';
import { STOP_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { IconButton, SPRING } from '@/shared/ui';

import { StopPin, ViaDot } from '../map/StopPin';
import { isVia, stopTitle, type DraftStop } from './model';

export interface StopLeg {
  meters: number;
  minutes: number | null;
  estimate: boolean;
}

interface StopRowProps {
  stop: DraftStop;
  number: number;
  /** Way from the previous visible stop; absent for the first one and shaping points. */
  leg: StopLeg | undefined;
  selected: boolean;
  onOpen: () => void;
  onRemove: () => void;
  /** «Вставить точку перед этой». */
  onInsertBefore?: () => void;
}

function Grip({ onPointerDown }: { onPointerDown: (event: PointerEvent) => void }) {
  return (
    <button
      type="button"
      aria-label="Перетащите, чтобы поменять порядок"
      onPointerDown={onPointerDown}
      className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-ink-faint active:cursor-grabbing active:text-ink"
    >
      <GripVertical size={18} aria-hidden />
    </button>
  );
}

function LegLine({ leg, onInsertBefore }: { leg: StopLeg; onInsertBefore?: () => void }) {
  return (
    <div className="flex items-center gap-1 pb-1 pl-10 text-xs text-ink-faint">
      <CornerDownRight size={13} aria-hidden />
      <span className="tabular-nums">
        {leg.estimate ? '≈ ' : ''}
        {formatDistance(leg.meters)}
        {leg.minutes !== null && ` · ~${formatDuration(leg.minutes)}`}
      </span>
      {onInsertBefore && (
        <button
          type="button"
          onClick={onInsertBefore}
          className="tap-target relative ml-auto inline-flex h-6 items-center gap-0.5 rounded-full px-2 font-medium text-brand hover:bg-brand-soft"
        >
          <Plus size={13} aria-hidden />
          вставить
        </button>
      )}
    </div>
  );
}

function StopMeta({ stop }: { stop: DraftStop }) {
  const meta = STOP_KIND_META[stop.kind];
  const described = stop.note.trim() !== '' || stop.landmark.trim() !== '';
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs">
      <span className={cn('shrink-0 font-medium', TONES[meta.tone].text)}>{meta.label}</span>
      {stop.place && (
        <Link2 size={12} aria-label="Место с карты" className="shrink-0 text-ink-soft" />
      )}
      {stop.landmark.trim() && (
        <Signpost size={12} aria-label="Есть ориентир" className="shrink-0 text-warning-ink" />
      )}
      {stop.photos.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-ink-soft">
          <ImageIcon size={12} aria-hidden />
          {stop.photos.length}
        </span>
      )}
      {!described && <span className="truncate text-brand">· добавьте описание</span>}
    </p>
  );
}

/** A stop in the builder list: drag handle, number, title, what is filled in, remove. */
export function StopRow({
  stop,
  number,
  leg,
  selected,
  onOpen,
  onRemove,
  onInsertBefore,
}: StopRowProps) {
  const controls = useDragControls();
  const via = isVia(stop);

  return (
    <Reorder.Item
      value={stop.id}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={SPRING.layout}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileDrag={{ scale: 1.03, boxShadow: 'var(--shadow-float)', zIndex: 20 }}
      className="relative rounded-card bg-surface"
    >
      {leg && !via && <LegLine leg={leg} onInsertBefore={onInsertBefore} />}
      <div
        className={cn(
          'flex items-center gap-1 rounded-card border pr-1 transition-colors duration-150',
          via ? 'border-dashed border-line py-0.5' : 'py-1.5',
          !via && (selected ? 'border-brand bg-brand-soft/40' : 'border-line/80'),
        )}
      >
        <Grip onPointerDown={(event) => controls.start(event)} />
        <button
          type="button"
          onClick={onOpen}
          disabled={via}
          className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left disabled:cursor-default"
        >
          {via ? (
            <span className="flex w-8 justify-center">
              <ViaDot />
            </span>
          ) : (
            <StopPin number={number} kind={stop.kind} />
          )}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block truncate',
                via ? 'text-sm text-ink-soft' : 'text-base font-semibold text-ink',
              )}
            >
              {stopTitle(stop, number)}
            </span>
            {!via && <StopMeta stop={stop} />}
          </span>
        </button>
        <IconButton
          icon={X}
          label={via ? 'Удалить точку трека' : 'Удалить точку'}
          size="md"
          onClick={onRemove}
        />
      </div>
    </Reorder.Item>
  );
}
