import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import { SPRING, STAGGER_LIMIT, STAGGER_STEP, TWEEN } from '@/shared/ui';

interface RemovableItemProps {
  /** Position in the list — sets the staggered entrance delay. */
  index: number;
  children: ReactNode;
}

/**
 * List item that enters staggered, slides away when removed and lets the rest of the list
 * close the gap smoothly. Render inside `<AnimatePresence initial={false}>`.
 */
export function RemovableItem({ index, children }: RemovableItemProps) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { ...SPRING.sheet, delay: Math.min(index, STAGGER_LIMIT) * STAGGER_STEP },
      }}
      exit={{ opacity: 0, x: -32, transition: TWEEN.fast }}
      transition={SPRING.layout}
    >
      {children}
    </motion.li>
  );
}
