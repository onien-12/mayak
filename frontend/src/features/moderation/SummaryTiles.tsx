import { CheckCheck, Inbox } from 'lucide-react';
import { motion } from 'motion/react';

import type { ModerationTrigger } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { MODERATION_TRIGGER_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { AnimatedNumber, Skeleton, SPRING, STAGGER_STEP } from '@/shared/ui';

import { useModerationSummary } from './useModeration';

interface SummaryTilesProps {
  activeTrigger: ModerationTrigger | undefined;
  /** Tapping a trigger filters the queue by it (tap again to clear). */
  onTrigger: (trigger: ModerationTrigger | undefined) => void;
}

/** Open cases, resolved today and the open queue split by trigger. */
export function SummaryTiles({ activeTrigger, onTrigger }: SummaryTilesProps) {
  const summary = useModerationSummary();

  if (summary.isPending) return <Skeleton className="h-36 rounded-panel" />;
  if (summary.isError) return null;

  const { open, resolved_today: resolvedToday, by_trigger: byTrigger } = summary.data;
  const triggers = (Object.keys(byTrigger) as ModerationTrigger[]).filter(
    (trigger) => byTrigger[trigger] > 0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING.sheet}
          className="flex items-center gap-3 rounded-card bg-brand p-4 text-white"
        >
          <Inbox size={22} aria-hidden className="shrink-0 text-beam" />
          <p>
            <span className="block font-display text-3xl leading-none font-bold">
              <AnimatedNumber value={open} countUp />
            </span>
            <span className="text-sm text-white/75">в очереди</span>
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.sheet, delay: STAGGER_STEP }}
          className="flex items-center gap-3 rounded-card border border-line/70 bg-surface p-4"
        >
          <CheckCheck size={22} aria-hidden className="shrink-0 text-success" />
          <p>
            <span className="block font-display text-3xl leading-none font-bold text-ink">
              <AnimatedNumber value={resolvedToday} countUp />
            </span>
            <span className="text-sm text-ink-soft">решено сегодня</span>
          </p>
        </motion.div>
      </div>
      {triggers.length > 0 && (
        <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          {triggers.map((trigger) => {
            const meta = MODERATION_TRIGGER_META[trigger];
            const Icon = meta.icon;
            const selected = activeTrigger === trigger;
            return (
              <button
                key={trigger}
                type="button"
                aria-pressed={selected}
                onClick={() => onTrigger(selected ? undefined : trigger)}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-[background-color,border-color,transform] active:scale-[0.97]',
                  selected
                    ? cn(TONES[meta.tone].soft, TONES[meta.tone].border)
                    : 'border-line bg-surface text-ink-soft',
                )}
              >
                <Icon size={15} aria-hidden />
                {meta.label}
                <span className="rounded-full bg-ink/8 px-1.5 text-xs font-semibold tabular-nums">
                  {byTrigger[trigger]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
