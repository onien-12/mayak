import { motion } from 'motion/react';

import type { PlaceStatus, Stats } from '@/shared/api';
import { formatNumber } from '@/shared/lib/format';
import { STATUS_META } from '@/shared/lib/labels';
import { SPRING } from '@/shared/ui';

import { ChartCard, DataTable, Legend } from './ChartCard';
import { formatShare } from './chartUtils';

/** Most trusted first; semantic colours of the trust badges. */
const ORDER: readonly PlaceStatus[] = ['verified', 'preliminary', 'unverified', 'needs_review'];
const COLORS: Partial<Record<PlaceStatus, string>> = {
  verified: 'var(--color-success)',
  preliminary: 'var(--color-infrastructure)',
  unverified: 'var(--color-ink-faint)',
  needs_review: 'var(--color-warning)',
};

/** «Насколько можно доверять карте»: one stacked bar of verification statuses. */
export function TrustBreakdown({ breakdown }: { breakdown: Stats['status_breakdown'] }) {
  const rows = ORDER.map((status) => ({
    status,
    count: breakdown.find((item) => item.status === status)?.count ?? 0,
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const confirmed = rows
    .filter((row) => row.status === 'verified' || row.status === 'preliminary')
    .reduce((sum, row) => sum + row.count, 0);
  const visible = rows.filter((row) => row.count > 0);

  return (
    <ChartCard
      title="Насколько можно доверять карте"
      subtitle={`${formatShare(confirmed, total)} мест подтверждены хотя бы одним жителем`}
      delay={0.05}
    >
      <div
        role="img"
        aria-label={rows.map((row) => `${STATUS_META[row.status].label}: ${row.count}`).join(', ')}
        className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-canvas"
      >
        {visible.map((row, index) => (
          <motion.span
            key={row.status}
            style={{ flexGrow: row.count, background: COLORS[row.status] }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ ...SPRING.soft, delay: 0.1 + index * 0.08 }}
            className="h-full origin-left first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <Legend
        items={rows.map((row) => ({
          key: row.status,
          label: STATUS_META[row.status].label,
          color: COLORS[row.status] ?? 'var(--color-line)',
          value: (
            <>
              <span className="mr-2 font-normal text-ink-soft">{formatNumber(row.count)}</span>
              {formatShare(row.count, total)}
            </>
          ),
        }))}
      />
      <p className="text-xs text-ink-soft">
        Статус меняется сам: каждое «Присутствует» или «Отсутствует» от жителей пересчитывает
        доверие к месту.
      </p>
      <DataTable
        caption="Места по статусу проверки"
        columns={['Статус', 'Мест', 'Доля']}
        rows={rows.map((row) => [
          STATUS_META[row.status].label,
          row.count,
          formatShare(row.count, total),
        ])}
      />
    </ChartCard>
  );
}
