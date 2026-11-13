import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useMediaQuery } from '../hooks/useMediaQuery';
import { cn } from '../lib/cn';
import { fadeVariants, popVariants, SPRING, TWEEN } from './motion';
import { useDialogFocus } from './useDialogFocus';

const DISMISS_OFFSET_PX = 110;
const DISMISS_VELOCITY = 600;

interface ModalSurfaceProps {
  open: boolean;
  onClose: () => void;
  /** `aria-labelledby` target id or a plain label. */
  labelledBy?: string;
  label?: string;
  /** Desktop width class, e.g. `sm:max-w-md`. */
  widthClassName?: string;
  className?: string;
  children: ReactNode;
}

/**
 * The modal layer behind `Modal`, action sheets and popovers on phones. Phone: a bottom
 * sheet that springs up and can be flicked down by its grip. Desktop (≥ 640 px): a centred
 * card that fades and scales in. Handles focus trap, Escape and backdrop press.
 */
export function ModalSurface({
  open,
  onClose,
  labelledBy,
  label,
  widthClassName = 'sm:max-w-md',
  className,
  children,
}: ModalSurfaceProps) {
  const wide = useMediaQuery('(min-width: 640px)');
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);
  const dragControls = useDragControls();

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET_PX || info.velocity.y > DISMISS_VELOCITY) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            aria-hidden
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-ink/45"
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={label}
            tabIndex={-1}
            {...(wide
              ? { variants: popVariants, initial: 'hidden', animate: 'visible', exit: 'exit' }
              : {
                  initial: { y: '100%' },
                  animate: { y: 0, transition: SPRING.sheet },
                  exit: { y: '100%', transition: TWEEN.base },
                  drag: 'y' as const,
                  dragControls,
                  dragListener: false,
                  dragConstraints: { top: 0, bottom: 0 },
                  dragElastic: { top: 0, bottom: 0.6 },
                  onDragEnd,
                })}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col rounded-t-panel bg-surface shadow-float outline-none sm:rounded-panel',
              widthClassName,
              className,
            )}
          >
            {!wide && (
              <div
                onPointerDown={(event) => dragControls.start(event)}
                className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
              >
                <span aria-hidden className="h-1 w-9 rounded-full bg-ink-faint/40" />
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
