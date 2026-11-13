import type { UseQueryResult } from '@tanstack/react-query';
import { ChevronRight, CircleCheck, ZapOff } from 'lucide-react';
import { motion } from 'motion/react';

import type { OutageSummary } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber, plural, PLURALS } from '@/shared/lib/format';
import { OUTAGE_RESOURCE_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { PRESS_SCALE, Skeleton, TWEEN } from '@/shared/ui';

import { joinResources } from './outageText';

function headline(summary: OutageSummary | undefined, failed: boolean): string {
  if (failed || !summary) return 'Не удалось загрузить отключения';
  const { buildings, outages } = summary.totals;
  if (outages === 0) return 'Отключений воды, тепла и света сейчас нет';
  const missing = joinResources(
    summary.by_resource.filter((stat) => stat.outages > 0).map((stat) => stat.resource),
  );
  return `${formatNumber(buildings)} ${plural(buildings, PLURALS.address)} сейчас без ${missing}`;
}

interface OutagesGlanceProps {
  summary: UseQueryResult<OutageSummary>;
  onOpen: () => void;
}

/**
 * The top of «Все»: how many addresses are without water, heat or light right now, one tap
 * away from the full «Отключения».
 */
export function OutagesGlance({ summary, onOpen }: OutagesGlanceProps) {
  if (summary.isPending) return <Skeleton className="h-[68px] rounded-card" />;

  const data = summary.data;
  const clear = data?.totals.outages === 0;
  const active = data?.by_resource.filter((stat) => stat.outages > 0) ?? [];

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: PRESS_SCALE }}
      transition={TWEEN.fast}
      className="flex w-full items-center gap-3 rounded-card border border-line/70 bg-surface p-3 text-left transition-[border-color,box-shadow] duration-150 hover:border-ink-faint/50 hover:shadow-card"
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          clear ? TONES.success.soft : TONES.issue.soft,
        )}
      >
        {clear ? <CircleCheck size={19} aria-hidden /> : <ZapOff size={19} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-ink-soft">Отключения</span>
        <span className="block text-sm leading-snug font-semibold text-ink">
          {headline(data, summary.isError)}
        </span>
        {active.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {active.map((stat) => {
              const meta = OUTAGE_RESOURCE_META[stat.resource];
              const Icon = meta.icon;
              return (
                <span
                  key={stat.resource}
                  className={cn(
                    'inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-2xs font-medium',
                    TONES[meta.tone].soft,
                  )}
                >
                  <Icon size={11} aria-hidden />
                  {formatNumber(stat.buildings)}
                </span>
              );
            })}
          </span>
        )}
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-faint" />
    </motion.button>
  );
}
