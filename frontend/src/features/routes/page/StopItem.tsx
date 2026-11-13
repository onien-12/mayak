import { ChevronRight, Clock } from 'lucide-react';
import type { Ref } from 'react';

import { usePlaceParam } from '@/features/map';
import { cn } from '@/shared/lib/cn';
import { formatDuration } from '@/shared/lib/format';
import { STOP_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { PhotoGrid, StaggerItem } from '@/shared/ui';

import { legLabel, type NumberedStop } from '../lib/stops';
import { LandmarkNote } from '../ui/LandmarkNote';

interface StopItemProps {
  item: NumberedStop;
  last: boolean;
  active: boolean;
  onSelect: () => void;
  ref?: Ref<HTMLLIElement>;
}

/** One station of the journey: rail with the number, what to see, landmark, photos. */
export function StopItem({ item, last, active, onSelect, ref }: StopItemProps) {
  const { stop, number, legM, legMin } = item;
  const meta = STOP_KIND_META[stop.kind];
  const { openPlace } = usePlaceParam();

  return (
    <StaggerItem ref={ref} index={number - 1} className="relative flex scroll-mt-4 gap-3">
      <div className="relative flex w-9 shrink-0 flex-col items-center">
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Показать точку ${number} на карте`}
          className={cn(
            'relative z-10 flex size-9 items-center justify-center rounded-full border-2 border-white font-semibold tabular-nums shadow-pin transition-transform duration-200',
            TONES[meta.tone].solid,
            active && 'scale-110 ring-3 ring-beam',
          )}
        >
          {number}
        </button>
        {!last && (
          <span
            aria-hidden
            className="mt-1 w-0.5 flex-1 rounded-full bg-[repeating-linear-gradient(to_bottom,var(--color-ink-faint)_0_6px,transparent_6px_11px)] opacity-60"
          />
        )}
      </div>

      <div
        className={cn(
          'mb-4 min-w-0 flex-1 rounded-card border p-3 transition-[border-color,box-shadow] duration-200',
          active ? 'border-brand shadow-card' : 'border-line/70',
        )}
      >
        {legM !== null && legMin !== null && (
          <p className="mb-1 text-xs font-medium text-ink-faint">{legLabel(legM, legMin)}</p>
        )}
        <p className={cn('flex items-center gap-1 text-xs font-medium', TONES[meta.tone].text)}>
          <meta.icon size={13} aria-hidden />
          {meta.label}
        </p>
        <h3 className="mt-0.5 text-base leading-snug font-semibold text-ink">
          <button type="button" onClick={onSelect} className="text-left">
            {stop.title}
          </button>
        </h3>
        {stop.note && (
          <p className="mt-1.5 text-sm whitespace-pre-line text-ink-soft">{stop.note}</p>
        )}
        {stop.landmark && <LandmarkNote text={stop.landmark} className="mt-2.5" />}
        {stop.photos.length > 0 && (
          <PhotoGrid photos={stop.photos} alt={stop.title} className="mt-2.5" />
        )}
        {(stop.stay_min > 0 || stop.place) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {stop.stay_min > 0 && (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-canvas px-2.5 text-xs font-medium text-ink-soft">
                <Clock size={13} aria-hidden />
                Остановка ~{formatDuration(stop.stay_min)}
              </span>
            )}
            {stop.place && (
              <button
                type="button"
                onClick={() => stop.place && openPlace(stop.place.id)}
                className="tap-target relative inline-flex h-7 min-w-0 items-center gap-1 rounded-full bg-brand-soft pr-1.5 pl-2.5 text-xs font-medium text-brand"
              >
                <span className="truncate">Место на карте</span>
                <ChevronRight size={14} aria-hidden className="shrink-0" />
              </button>
            )}
          </div>
        )}
      </div>
    </StaggerItem>
  );
}
