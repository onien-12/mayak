import { Heart } from 'lucide-react';
import { motion } from 'motion/react';

import { cn } from '../lib/cn';
import { SPRING } from './motion';

interface HeartButtonProps {
  active: boolean;
  onToggle: () => void;
  /** Accessible names for both states. */
  labels: { on: string; off: string };
  className?: string;
}

/** Favorite / save toggle with a pop-and-fill micro-interaction. */
export function HeartButton({ active, onToggle, labels, className }: HeartButtonProps) {
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      aria-label={active ? labels.on : labels.off}
      title={active ? labels.on : labels.off}
      whileTap={{ scale: 0.82 }}
      transition={SPRING.pop}
      onClick={onToggle}
      className={cn(
        'tap-target relative inline-flex size-10 shrink-0 items-center justify-center rounded-control transition-colors duration-150',
        active ? 'bg-issue-soft text-issue' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
        className,
      )}
    >
      <motion.span
        key={String(active)}
        initial={{ scale: active ? 0.5 : 1 }}
        animate={{ scale: 1 }}
        transition={SPRING.pop}
        className="inline-flex"
      >
        <Heart
          size={18}
          aria-hidden
          className={cn('transition-colors duration-150', active && 'fill-issue')}
        />
      </motion.span>
    </motion.button>
  );
}
