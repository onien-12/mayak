import { Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import type { Stats } from '@/shared/api';
import { formatNumber, pluralize, PLURALS } from '@/shared/lib/format';
import { EmptyState, SPRING } from '@/shared/ui';

import { ChartCard, DataTable, Legend } from './ChartCard';
import { niceMax } from './chartUtils';
import { useElementWidth } from './useElementWidth';

const H = 220;
const PAD = { top: 12, right: 8, bottom: 24, left: 28 };
const PLOT_H = H - PAD.top - PAD.bottom;
const VOTES_COLOR = 'var(--color-brand)';
const PLACES_COLOR = 'var(--color-tourism)';
const TICK_EVERY = 7;
/** Last-day label is skipped when it would collide with the previous tick. */
const TICK_GAP = 3;

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
/** `YYYY-MM-DD` is a calendar day — parse it as local noon to avoid time-zone shifts. */
const dayLabel = (date: string) => dayFormat.format(new Date(`${date}T12:00:00`)).replace('.', '');

/** 30 days of activity: verification votes as columns, new places as a line, on one axis. */
export function ActivityChart({ activity }: { activity: Stats['activity'] }) {
  const [active, setActive] = useState<number | null>(null);
  const { ref, width: W } = useElementWidth<HTMLDivElement>(360);
  const PLOT_W = W - PAD.left - PAD.right;
  const days = activity.length;
  const totalPlaces = activity.reduce((sum, day) => sum + day.places, 0);
  const totalVotes = activity.reduce((sum, day) => sum + day.votes, 0);
  const max = niceMax(Math.max(0, ...activity.map((day) => Math.max(day.places, day.votes))));
  const band = days > 0 ? PLOT_W / days : PLOT_W;
  const barWidth = Math.min(band * 0.62, 14);
  const x = (index: number) => PAD.left + band * index + band / 2;
  const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;
  const line = activity
    .map((day, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(day.places)}`)
    .join(' ');
  const focused = active !== null ? activity[active] : undefined;

  if (days === 0 || totalPlaces + totalVotes === 0) {
    return (
      <ChartCard title="Активность за 30 дней" className="lg:col-span-2">
        <EmptyState
          icon={Activity}
          title="Пока тихо"
          description="Данные появятся, как только жители начнут отмечать места."
          className="py-6"
        />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Активность за 30 дней"
      subtitle={`${pluralize(totalPlaces, ['новое место', 'новых места', 'новых мест'])} от жителей и ${pluralize(totalVotes, PLURALS.confirmation)}`}
      className="lg:col-span-2"
      delay={0.05}
    >
      <Legend
        className="flex-row flex-wrap gap-x-5"
        items={[
          { key: 'votes', label: 'Подтверждения жителей', color: VOTES_COLOR },
          { key: 'places', label: 'Места от жителей', color: PLACES_COLOR },
        ]}
      />
      <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block overflow-visible"
          role="img"
          aria-label="Активность по дням: подтверждения и новые места от жителей"
        >
          {[0, 0.5, 1].map((share) => (
            <g key={share}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(max * share)}
                y2={y(max * share)}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(max * share) + 4}
                textAnchor="end"
                className="fill-ink-faint text-[11px] tabular-nums"
              >
                {formatNumber(max * share)}
              </text>
            </g>
          ))}
          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--color-ink-faint)"
              strokeWidth={1}
            />
          )}
          {activity.map((day, index) => (
            <motion.rect
              key={day.date}
              x={x(index) - barWidth / 2}
              y={y(day.votes)}
              width={barWidth}
              height={Math.max(0, PAD.top + PLOT_H - y(day.votes))}
              rx={Math.min(3, barWidth / 2)}
              fill={VOTES_COLOR}
              style={{ originY: 1 }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1, opacity: active === null || active === index ? 0.9 : 0.35 }}
              transition={{ ...SPRING.soft, delay: index * 0.012 }}
            />
          ))}
          <motion.path
            d={line}
            fill="none"
            stroke={PLACES_COLOR}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
          />
          {focused && active !== null && (
            <circle
              cx={x(active)}
              cy={y(focused.places)}
              r={5}
              fill={PLACES_COLOR}
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          )}
          {activity.map((day, index) =>
            index % TICK_EVERY === 0 || (index === days - 1 && index % TICK_EVERY >= TICK_GAP) ? (
              <text
                key={day.date}
                x={x(index)}
                y={H - 6}
                textAnchor="middle"
                className="fill-ink-faint text-[11px]"
              >
                {dayLabel(day.date)}
              </text>
            ) : null,
          )}
          {activity.map((day, index) => (
            <rect
              key={day.date}
              x={PAD.left + band * index}
              y={PAD.top}
              width={band}
              height={PLOT_H}
              fill="transparent"
              onPointerEnter={() => setActive(index)}
              onPointerDown={() => setActive(index)}
            />
          ))}
        </svg>
        {focused && active !== null && (
          <div
            role="status"
            style={{ left: `${Math.min(85, Math.max(15, (x(active) / W) * 100))}%` }}
            className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-control bg-ink px-3 py-2 text-xs text-white shadow-float"
          >
            <p className="font-semibold">{dayLabel(focused.date)}</p>
            <p>Подтверждений: {focused.votes}</p>
            <p>Новых мест: {focused.places}</p>
          </div>
        )}
      </div>
      <DataTable
        caption="Активность по дням"
        columns={['Дата', 'Подтверждения', 'Новые места']}
        rows={activity.map((day) => [day.date, day.votes, day.places])}
      />
    </ChartCard>
  );
}
