import { Users } from 'lucide-react';
import { motion } from 'motion/react';

import type { ExternalSourceId, Stats } from '@/shared/api';
import { formatNumber, plural } from '@/shared/lib/format';
import { EXTERNAL_SOURCE_META } from '@/shared/lib/labels';
import { OsmCredit, SPRING } from '@/shared/ui';

import { ChartCard, DataTable } from './ChartCard';
import { formatShare } from './chartUtils';

/** Fixed identity per source (validated as an ordered categorical set). */
const COMMUNITY_COLOR = '#2F6BD8';
const SOURCE_ORDER: readonly ExternalSourceId[] = ['vl_ru_off', 'vl_ru', 'osm', 'wikivoyage'];
const SOURCE_COLOR: Record<ExternalSourceId, string> = {
  vl_ru_off: '#E5484D',
  vl_ru: '#7C5CFC',
  osm: '#0E9C9B',
  wikivoyage: '#D97706',
};

/** Genitive after «из N»: «из 21 импортированного объекта», «из 158 импортированных объектов». */
const IMPORTED_OF = [
  'импортированного объекта',
  'импортированных объектов',
  'импортированных объектов',
] as const;

interface Row {
  key: string;
  label: string;
  hint: string;
  count: number;
  color: string;
  icon: typeof Users;
}

/**
 * «Источники данных»: what residents put on the map themselves next to what was imported
 * (each source with its share), and how many imported objects residents already confirmed.
 */
export function DataSources({ stats }: { stats: Stats }) {
  const sources = stats.imported_by_source;
  const imported = stats.totals.imported_places;

  const rows: Row[] = [
    {
      key: 'community',
      label: 'Жители',
      hint: 'отметили сами',
      count: stats.totals.places,
      color: COMMUNITY_COLOR,
      icon: Users,
    },
    ...SOURCE_ORDER.flatMap((id) => {
      const source = sources.find((item) => item.source === id);
      if (!source || source.count === 0) return [];
      const meta = EXTERNAL_SOURCE_META[id];
      return [
        {
          key: id,
          label: source.label,
          hint: 'импорт',
          count: source.count,
          color: SOURCE_COLOR[id],
          icon: meta.icon,
        },
      ];
    }),
  ];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const confirmed = stats.totals.confirmed_imported;

  return (
    <ChartCard
      title="Источники данных"
      subtitle={`${formatShare(stats.totals.places, total)} мест на карте добавили жители, остальное — импорт из открытых источников`}
    >
      <div aria-hidden className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-canvas">
        {rows.map((row, index) => (
          <motion.span
            key={row.key}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ ...SPRING.soft, delay: index * 0.06 }}
            style={{ flexGrow: row.count, background: row.color }}
            className="h-full min-w-1 origin-left first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center gap-3 rounded-card border border-line/70 p-3"
          >
            <span
              aria-hidden
              style={{ background: row.color }}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
            >
              <row.icon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{row.label}</span>
              <span className="block text-xs text-ink-soft">
                {row.hint} · {formatShare(row.count, total)}
              </span>
            </span>
            <span className="shrink-0 font-display text-lg font-semibold text-ink tabular-nums">
              {formatNumber(row.count)}
            </span>
          </li>
        ))}
      </ul>
      {imported > 0 && (
        <div className="flex flex-col gap-2 rounded-card bg-canvas p-3.5">
          <p className="text-sm text-ink">
            Жители уже подтвердили на месте{' '}
            <span className="font-semibold">
              {formatNumber(confirmed)} из {formatNumber(imported)}
            </span>{' '}
            {plural(imported, IMPORTED_OF)}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: confirmed / imported }}
              transition={SPRING.soft}
              className="h-full origin-left rounded-full bg-success"
            />
          </div>
        </div>
      )}
      {sources.some((source) => source.source === 'osm' && source.count > 0) && (
        <OsmCredit prefix="Объекты и территории OpenStreetMap: " />
      )}
      <DataTable
        caption="Источники мест на карте"
        columns={['Источник', 'Мест', 'Доля']}
        rows={rows.map((row) => [row.label, row.count, formatShare(row.count, total)])}
      />
    </ChartCard>
  );
}
