import { Check } from 'lucide-react';
import { motion } from 'motion/react';

import type { IssueStage } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { ISSUE_STAGE_META, ISSUE_STAGES } from '@/shared/lib/labels';
import { SPRING } from '@/shared/ui';

/** Five-step lifecycle of an issue: detected → confirmed → forwarded → in progress → resolved. */
export function IssueStepper({ stage }: { stage: IssueStage }) {
  const current = ISSUE_STAGES.indexOf(stage);
  const next = ISSUE_STAGES[current + 1];
  const resolved = stage === 'resolved';

  return (
    <div>
      <ol
        aria-label="Этапы решения проблемы"
        className="relative flex items-center justify-between"
      >
        <div
          aria-hidden
          className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-line"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: current / (ISSUE_STAGES.length - 1) }}
            transition={SPRING.soft}
            className={cn('h-full origin-left rounded-full', resolved ? 'bg-success' : 'bg-issue')}
          />
        </div>
        {ISSUE_STAGES.map((item, index) => {
          const done = index < current || resolved;
          const active = index === current && !resolved;
          return (
            <li
              key={item}
              aria-current={index === current ? 'step' : undefined}
              aria-label={ISSUE_STAGE_META[item].label}
              title={ISSUE_STAGE_META[item].label}
              className={cn(
                'relative flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors duration-200',
                done && 'border-transparent bg-success text-white',
                active && 'border-issue bg-surface text-issue-ink ring-4 ring-issue/15',
                !done && !active && 'border-line bg-surface text-ink-faint',
              )}
            >
              {done ? <Check size={14} strokeWidth={3} aria-hidden /> : index + 1}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-ink">
        <span className="text-ink-soft">
          Этап {current + 1} из {ISSUE_STAGES.length}:
        </span>{' '}
        <span className="font-semibold">{ISSUE_STAGE_META[stage].label}</span>
        {next && <span className="text-ink-faint"> · дальше «{ISSUE_STAGE_META[next].label}»</span>}
      </p>
    </div>
  );
}
