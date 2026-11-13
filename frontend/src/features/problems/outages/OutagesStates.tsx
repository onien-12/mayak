import { CircleCheck, ExternalLink, History } from 'lucide-react';

import type { OutageSummary } from '@/shared/api';
import { formatRelative } from '@/shared/lib/format';
import { Banner, buttonClasses, Rise, Skeleton } from '@/shared/ui';

export function StaleNotice({ summary }: { summary: OutageSummary }) {
  return (
    <Banner tone="warning" icon={History} title="Данные могли устареть">
      {summary.updated_at
        ? `Последнее обновление с VL.ru было ${formatRelative(summary.updated_at)}. Уточните на сайте источника.`
        : 'Данные с VL.ru ещё ни разу не загрузились. Уточните на сайте источника.'}
    </Banner>
  );
}

/** No current outages: a calm, reassuring state. */
export function AllClear({ summary }: { summary: OutageSummary }) {
  return (
    <Rise className="flex flex-col items-center rounded-card bg-linear-to-b from-success-soft to-surface px-5 py-8 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-surface text-success shadow-card">
        <CircleCheck size={32} aria-hidden />
      </span>
      <h2 className="font-display text-lg font-semibold text-ink">Сейчас всё работает</h2>
      <p className="mt-1 max-w-xs text-sm text-ink-soft">
        Отключений воды, тепла и света во Владивостоке нет
        {summary.updated_at ? ` — проверено ${formatRelative(summary.updated_at)}.` : '.'}
      </p>
      <a
        href={summary.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'mt-3' })}
      >
        Отключения на VL.ru
        <ExternalLink size={15} aria-hidden />
      </a>
    </Rise>
  );
}

export function SummarySkeleton() {
  return (
    <div role="status" aria-label="Загрузка" className="flex flex-col gap-3">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-4 w-56" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-[72px] rounded-card" />
        ))}
      </div>
    </div>
  );
}
