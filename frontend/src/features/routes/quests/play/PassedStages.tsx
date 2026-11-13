import { Check, ChevronDown, Lightbulb } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import type { QuestPassedStage } from '@/shared/api';
import { formatTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { TWEEN } from '@/shared/ui';

function Item({
  stage,
  open,
  onToggle,
}: {
  stage: QuestPassedStage;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="rounded-control border border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-xs font-bold text-white">
          {stage.position}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{stage.title}</span>
          <span className="flex items-center gap-1 text-xs text-ink-soft">
            <Check size={12} aria-hidden className="text-success" />
            {stage.passed_at && formatTime(stage.passed_at)}
            {stage.passed_by && ` · ${stage.passed_by.display_name}`}
            {stage.hint_used && (
              <Lightbulb size={12} aria-label="с подсказкой" className="ml-1 text-warning-ink" />
            )}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={cn('shrink-0 text-ink-faint transition-transform', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && stage.reward && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={TWEEN.fast}
            className="overflow-hidden px-3 text-sm whitespace-pre-line text-ink"
          >
            <span className="block pb-3">{stage.reward}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Stages already found, newest first: each opens the story of its place. */
export function PassedStages({ stages }: { stages: readonly QuestPassedStage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (stages.length === 0) return null;
  return (
    <section aria-labelledby="passed" className="flex flex-col gap-2">
      <h2 id="passed" className="font-display text-base font-semibold text-ink">
        Пройдено
      </h2>
      <ol className="flex flex-col gap-1.5">
        {[...stages].reverse().map((stage) => (
          <Item
            key={stage.position}
            stage={stage}
            open={open === stage.position}
            onToggle={() => setOpen(open === stage.position ? null : stage.position)}
          />
        ))}
      </ol>
    </section>
  );
}
