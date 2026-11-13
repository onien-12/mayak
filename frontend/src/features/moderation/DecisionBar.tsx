import { motion } from 'motion/react';

import type { ModerationAction } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { MODERATION_ACTION_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { PRESS_SCALE, SPRING, SuccessCheck, TWEEN } from '@/shared/ui';

import { ACTION_SHORT } from './moderationMeta';

interface DecisionBarProps {
  actions: readonly ModerationAction[];
  onChoose: (action: ModerationAction) => void;
  disabled: boolean;
}

/** Sticky decision bar in the thumb zone: only the actions that fit the current status. */
export function DecisionBar({ actions, onChoose, disabled }: DecisionBarProps) {
  return (
    <motion.div
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SPRING.sheet, delay: 0.15 }}
      className="sticky bottom-0 z-10 -mx-4 mt-2 -mb-5 border-t border-line/70 bg-surface/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur lg:mx-0 lg:mb-0 lg:rounded-panel lg:border lg:shadow-float"
    >
      <div
        className="grid gap-2 lg:ml-auto lg:max-w-xl"
        style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
      >
        {actions.map((action, index) => {
          const meta = MODERATION_ACTION_META[action];
          const Icon = meta.icon;
          const primary = index === 0;
          return (
            <motion.button
              key={action}
              type="button"
              disabled={disabled}
              whileTap={{ scale: PRESS_SCALE }}
              transition={TWEEN.fast}
              onClick={() => onChoose(action)}
              title={meta.description}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-0.5 rounded-control text-sm font-semibold transition-opacity disabled:opacity-50',
                primary
                  ? TONES[meta.tone].solid
                  : cn('border', TONES[meta.tone].soft, TONES[meta.tone].border),
              )}
            >
              <Icon size={19} aria-hidden />
              {ACTION_SHORT[action]}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

/** Feedback after a decision, shown for a moment before the next case opens. */
export function DecisionDone({ action }: { action: ModerationAction }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={TWEEN.base}
      className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface/90 backdrop-blur-sm"
    >
      <SuccessCheck size={96} />
      <p className="font-display text-xl font-semibold text-ink">
        {MODERATION_ACTION_META[action].done}
      </p>
      <p className="text-sm text-ink-soft">Открываем следующее обращение…</p>
    </motion.div>
  );
}
