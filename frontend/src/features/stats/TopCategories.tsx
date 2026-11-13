import { motion } from 'motion/react';

import type { Stats } from '@/shared/api';
import { formatNumber } from '@/shared/lib/format';
import { LAYER_META } from '@/shared/lib/labels';
import { SPRING } from '@/shared/ui';

import { ChartCard, DataTable } from './ChartCard';

/** Top categories as horizontal bars in their layer colour, value at the tip. */
export function TopCategories({ categories }: { categories: Stats['top_categories'] }) {
  const max = Math.max(1, ...categories.map((item) => item.count));
  if (categories.length === 0) return null;

  return (
    <ChartCard title="Популярные категории" subtitle="Чего на карте больше всего" delay={0.1}>
      <ol className="flex flex-col gap-2">
        {categories.map((item, index) => (
          <li key={item.category_id} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-ink">{item.name}</span>
              <span className="shrink-0 text-xs text-ink-soft">{LAYER_META[item.layer].short}</span>
            </span>
            <span className="flex items-center gap-2">
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: item.count / max }}
                transition={{ ...SPRING.soft, delay: index * 0.05 }}
                style={{ background: LAYER_META[item.layer].color }}
                className="block h-2.5 flex-1 origin-left rounded-r-full"
              />
              <span className="w-7 shrink-0 text-right text-sm font-semibold text-ink tabular-nums">
                {formatNumber(item.count)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <DataTable
        caption="Популярные категории"
        columns={['Категория', 'Слой', 'Мест']}
        rows={categories.map((item) => [item.name, LAYER_META[item.layer].label, item.count])}
      />
    </ChartCard>
  );
}
