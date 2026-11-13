import { LocateOff, Navigation } from 'lucide-react';
import { motion } from 'motion/react';

import { useUserLocation } from '@/features/map';
import { formatDistance, formatDuration } from '@/shared/lib/format';
import { haversine } from '@/shared/lib/geo';
import { Spinner, SPRING } from '@/shared/ui';

import { bearing, compassDirection } from '../lib/geometry';
import type { NumberedStop } from '../lib/stops';
import { LandmarkNote } from '../ui/LandmarkNote';

/** Within this distance the walker is considered to be at the point. */
const ARRIVED_M = 40;

function LiveDirection({ target }: { target: NumberedStop }) {
  const { location, status } = useUserLocation();

  if (status === 'denied' || status === 'unavailable') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <LocateOff size={14} aria-hidden className="shrink-0" />
        Без геолокации — ориентируйтесь по описанию и карте
      </p>
    );
  }
  if (!location) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Spinner size={14} /> Определяем, где вы…
      </p>
    );
  }

  const distance = haversine(location.point, target.stop);
  const heading = bearing(location.point, target.stop);
  const arrived = distance <= ARRIVED_M;

  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden
        className="relative flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-surface shadow-card"
      >
        <span className="absolute top-0.5 text-2xs font-semibold text-ink-faint">С</span>
        <motion.span animate={{ rotate: heading }} transition={SPRING.soft} className="flex">
          <Navigation
            size={24}
            className="fill-brand text-brand"
            style={{ transform: 'rotate(-45deg)' }}
          />
        </motion.span>
      </div>
      <div className="min-w-0">
        <p className="font-display text-2xl leading-tight font-semibold text-ink tabular-nums">
          {arrived ? 'Вы на месте' : formatDistance(distance)}
        </p>
        <p className="text-xs text-ink-soft">
          {arrived ? 'Отметьте «Я на месте»' : `по прямой, на ${compassDirection(heading)}`}
        </p>
      </div>
    </div>
  );
}

interface NextStopGuideProps {
  next: NumberedStop;
}

/**
 * The way to the next point, most important first so it fits above the sheet's fold: where
 * to go, how to recognise it, then the live direction.
 */
export function NextStopGuide({ next }: NextStopGuideProps) {
  return (
    <section
      aria-label="Следующая точка"
      className="flex flex-col gap-2.5 rounded-card bg-canvas p-3"
    >
      <p className="text-sm text-ink-soft">
        Дальше —{' '}
        <span className="font-semibold text-ink">
          {next.number}. {next.stop.title}
        </span>
        {next.legM !== null && next.legMin !== null && (
          <span className="text-ink-faint tabular-nums">
            {' '}
            · по маршруту {formatDistance(next.legM)}, ~{formatDuration(next.legMin)}
          </span>
        )}
      </p>
      {next.stop.landmark && <LandmarkNote text={next.stop.landmark} className="text-base" />}
      <LiveDirection target={next} />
    </section>
  );
}
