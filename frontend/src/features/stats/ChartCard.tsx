import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { Rise } from '@/shared/ui';

interface ChartCardProps {
  title: string;
  /** The one-line takeaway of the chart. */
  subtitle?: ReactNode;
  className?: string;
  delay?: number;
  children: ReactNode;
}

/** Frame of every statistics block: title, takeaway, chart. */
export function ChartCard({ title, subtitle, className, delay = 0, children }: ChartCardProps) {
  return (
    <Rise
      delay={delay}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-panel border border-line/70 bg-surface p-5 shadow-card',
        className,
      )}
    >
      <header>
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </header>
      {children}
    </Rise>
  );
}

interface LegendItem {
  key: string;
  label: string;
  /** CSS colour of the swatch. */
  color: string;
  value?: ReactNode;
}

/** Swatch + label + value; text stays in ink, identity comes from the swatch. */
export function Legend({ items, className }: { items: readonly LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-sm">
          <span
            aria-hidden
            style={{ background: item.color }}
            className="size-2.5 shrink-0 rounded-full"
          />
          <span className="min-w-0 flex-1 truncate text-ink">{item.label}</span>
          {item.value !== undefined && (
            <span className="shrink-0 font-semibold text-ink tabular-nums">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Screen-reader table behind a chart: every value stays accessible without the picture. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row[0])}>
            {row.map((cell, index) => (
              <td key={index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
