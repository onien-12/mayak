import { motion } from 'motion/react';

import type { Stats } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber } from '@/shared/lib/format';
import { ISSUE_STAGE_META, ISSUE_STAGES } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { SPRING } from '@/shared/ui';

import { ChartCard, DataTable } from './ChartCard';
import { formatShare } from './chartUtils';

/**
 * Issues funnel: how many problems reached each stage (a problem in work has also been
 * detected and confirmed), with the number currently sitting at the stage.
 */
export function IssuesFunnel({ byStage }: { byStage: Stats['issues_by_stage'] }) {
  const current = ISSUE_STAGES.map(
    (stage) => byStage.find((item) => item.stage === stage)?.count ?? 0,
  );
  const reached = current.map((_, index) =>
    current.slice(index).reduce((sum, count) => sum + count, 0),
  );
  const total = reached[0] ?? 0;
  const resolved = current[current.length - 1] ?? 0;

  return (
    <ChartCard
      title="Как решаются проблемы"
      subtitle={`Устранено ${formatShare(resolved, total)} из ${formatNumber(total)} сообщений`}
      delay={0.1}
    >
      <ol className="flex flex-col gap-2.5">
        {ISSUE_STAGES.map((stage, index) => {
          const meta = ISSUE_STAGE_META[stage];
          const Icon = meta.icon;
          const value = reached[index] ?? 0;
          return (
            <li key={stage} className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm text-ink">
                <Icon size={15} aria-hidden className={TONES[meta.tone].text} />
                {meta.label}
              </span>
              <span className="flex items-center gap-2">
                <span className="h-6 flex-1 overflow-hidden rounded-r-md bg-canvas">
                  <motion.span
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: total > 0 ? value / total : 0 }}
                    transition={{ ...SPRING.soft, delay: 0.1 + index * 0.07 }}
                    className={cn('block h-full origin-left rounded-r-md', TONES[meta.tone].fill)}
                  />
                </span>
                <span className="w-16 shrink-0 text-right text-sm">
                  <span className="font-semibold text-ink tabular-nums">{formatNumber(value)}</span>
                  {current[index] !== value && (
                    <span className="block text-2xs text-ink-faint">
                      сейчас {formatNumber(current[index] ?? 0)}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <DataTable
        caption="Проблемы по этапам"
        columns={['Этап', 'Дошли до этапа', 'Сейчас на этапе']}
        rows={ISSUE_STAGES.map((stage, index) => [
          ISSUE_STAGE_META[stage].label,
          reached[index] ?? 0,
          current[index] ?? 0,
        ])}
      />
    </ChartCard>
  );
}
