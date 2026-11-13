import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, type ReactNode } from 'react';

import type { RouteCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { SPRING } from '@/shared/ui';

interface CountUpProps {
  value: number;
  format: (value: number) => string;
}

/** Counts up from zero on mount and ticks on change, with any formatter (km, h:mm…). */
function CountUp({ value, format }: CountUpProps) {
  const reduced = useReducedMotion();
  const current = useMotionValue(reduced ? value : 0);
  const text = useTransform(current, format);

  useEffect(() => {
    if (reduced) {
      current.set(value);
      return;
    }
    const controls = animate(current, value, SPRING.soft);
    return () => controls.stop();
  }, [current, value, reduced]);

  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/** Number formats are chosen by the final value, so the unit never changes while counting. */
function distanceFormat(finalM: number): (meters: number) => string {
  if (finalM < 1000) return (meters) => String(Math.round(meters / 10) * 10);
  const digits = finalM < 10_000 ? 1 : 0;
  return (meters) => (meters / 1000).toFixed(digits).replace('.', ',');
}

function timeFormat(finalMin: number): (minutes: number) => string {
  if (Math.round(finalMin) < 60) return (minutes) => String(Math.round(minutes));
  return (minutes) => {
    const total = Math.round(minutes);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };
}

interface StatProps {
  label: string;
  unit: string;
  children: ReactNode;
}

function Stat({ label, unit, children }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-control bg-canvas px-1 py-2.5 text-center">
      <span className="max-w-full truncate text-2xs font-medium text-ink-faint">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-0.5 font-display text-base leading-tight font-semibold text-ink lg:text-lg">
        {children}
        {unit && <span className="font-sans text-2xs font-medium text-ink-soft">{unit}</span>}
      </span>
    </div>
  );
}

type StatsRoute = Pick<RouteCard, 'distance_m' | 'travel_min' | 'duration_min' | 'stops_count'>;

/** Distance, travel time, total time with stays and stops — counting up on arrival. */
export function RouteStats({ route, className }: { route: StatsRoute; className?: string }) {
  const timeUnit = (minutes: number) => (Math.round(minutes) < 60 ? 'мин' : 'ч');
  return (
    <div className={cn('grid grid-cols-4 gap-1.5', className)}>
      <Stat label="Длина" unit={route.distance_m < 1000 ? 'м' : 'км'}>
        <CountUp value={route.distance_m} format={distanceFormat(route.distance_m)} />
      </Stat>
      <Stat label="В пути" unit={timeUnit(route.travel_min)}>
        <CountUp value={route.travel_min} format={timeFormat(route.travel_min)} />
      </Stat>
      <Stat label="Всего" unit={timeUnit(route.duration_min)}>
        <CountUp value={route.duration_min} format={timeFormat(route.duration_min)} />
      </Stat>
      <Stat label="Точки" unit="">
        <CountUp value={route.stops_count} format={(value) => String(Math.round(value))} />
      </Stat>
    </div>
  );
}
