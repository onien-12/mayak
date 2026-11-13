import { motion } from 'motion/react';
import { useState } from 'react';

import type { Layer, Stats } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber, plural, PLURALS } from '@/shared/lib/format';
import { LAYER_META } from '@/shared/lib/labels';
import { SPRING, STAGGER_STEP } from '@/shared/ui';

import { ChartCard, DataTable } from './ChartCard';
import { arcPath, formatShare } from './chartUtils';

/** Tourism and issue colours are close, so they never sit next to each other in the ring. */
const ORDER: readonly Layer[] = ['infrastructure', 'tourism', 'event', 'issue'];
const SIZE = 200;
const OUTER = 96;
const INNER = 64;
const PAD = 0.025;

/** Share of each layer as a donut with the total in the centre; tap a segment or a row. */
export function LayerDonut({ byLayer }: { byLayer: Stats['by_layer'] }) {
  const [active, setActive] = useState<Layer | null>(null);
  const counts = ORDER.map((layer) => ({
    layer,
    count: byLayer.find((item) => item.layer === layer)?.count ?? 0,
  }));
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const segments = counts.reduce<{ layer: Layer; count: number; start: number; end: number }[]>(
    (list, item) => {
      const start = list.at(-1)?.end ?? 0;
      const end = start + (total > 0 ? (item.count / total) * Math.PI * 2 : 0);
      return [...list, { ...item, start, end }];
    },
    [],
  );
  const focused = counts.find((item) => item.layer === active);
  const toggle = (layer: Layer) => setActive((current) => (current === layer ? null : layer));

  return (
    <ChartCard title="Что отмечают жители" subtitle="Доля каждого слоя карты">
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative shrink-0">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width={SIZE}
            height={SIZE}
            role="img"
            aria-label={`Всего ${formatNumber(total)} мест по слоям`}
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={(OUTER + INNER) / 2}
              fill="none"
              stroke="var(--color-canvas)"
              strokeWidth={OUTER - INNER}
            />
            {segments.map((segment, index) =>
              segment.count > 0 ? (
                <motion.path
                  key={segment.layer}
                  d={arcPath(
                    SIZE / 2,
                    SIZE / 2,
                    OUTER,
                    INNER,
                    segment.start + PAD / 2,
                    segment.end - PAD / 2,
                  )}
                  fill={LAYER_META[segment.layer].color}
                  style={{ originX: '50%', originY: '50%' }}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{
                    opacity: active && active !== segment.layer ? 0.35 : 1,
                    scale: active === segment.layer ? 1.04 : 1,
                  }}
                  transition={{ ...SPRING.sheet, delay: index * STAGGER_STEP * 2 }}
                  onClick={() => toggle(segment.layer)}
                  className="cursor-pointer"
                />
              ) : null,
            )}
          </svg>
          <div
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
          >
            <span className="font-display text-3xl leading-none font-bold text-ink tabular-nums">
              {formatNumber(focused?.count ?? total)}
            </span>
            <span className="mt-1 max-w-24 text-xs leading-tight text-ink-soft">
              {focused ? LAYER_META[focused.layer].short : plural(total, PLURALS.place)}
            </span>
          </div>
        </div>
        <ul className="flex w-full flex-col gap-1">
          {counts.map(({ layer, count }) => (
            <li key={layer}>
              <button
                type="button"
                aria-pressed={active === layer}
                onClick={() => toggle(layer)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-sm transition-colors',
                  active === layer ? 'bg-canvas' : 'hover:bg-canvas/60',
                )}
              >
                <span
                  aria-hidden
                  style={{ background: LAYER_META[layer].color }}
                  className="size-3 shrink-0 rounded-full"
                />
                <span className="flex-1 text-ink">{LAYER_META[layer].label}</span>
                <span className="text-ink-soft tabular-nums">{formatNumber(count)}</span>
                <span className="w-12 text-right font-semibold text-ink tabular-nums">
                  {formatShare(count, total)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <DataTable
        caption="Места по слоям"
        columns={['Слой', 'Мест', 'Доля']}
        rows={counts.map(({ layer, count }) => [
          LAYER_META[layer].label,
          count,
          formatShare(count, total),
        ])}
      />
    </ChartCard>
  );
}
