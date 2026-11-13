import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useDismiss } from '../hooks/useDismiss';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { cn } from '../lib/cn';
import { ModalSurface } from './ModalSurface';
import { popVariants } from './motion';

export type PopoverPlacement =
  'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-end';

const GAP = 8;
const EDGE = 8;

function computeStyle(rect: DOMRect, placement: PopoverPlacement): CSSProperties {
  const { innerWidth: vw, innerHeight: vh } = window;
  switch (placement) {
    case 'bottom-start':
      return {
        top: rect.bottom + GAP,
        left: Math.max(EDGE, rect.left),
        maxHeight: vh - rect.bottom - GAP - EDGE,
      };
    case 'bottom-end':
      return {
        top: rect.bottom + GAP,
        right: Math.max(EDGE, vw - rect.right),
        maxHeight: vh - rect.bottom - GAP - EDGE,
      };
    case 'top-start':
      return {
        bottom: vh - rect.top + GAP,
        left: Math.max(EDGE, rect.left),
        maxHeight: rect.top - GAP - EDGE,
      };
    case 'top-end':
      return {
        bottom: vh - rect.top + GAP,
        right: Math.max(EDGE, vw - rect.right),
        maxHeight: rect.top - GAP - EDGE,
      };
    case 'right-end':
      return {
        left: rect.right + GAP,
        bottom: Math.max(EDGE, vh - rect.bottom),
        maxHeight: vh - 2 * EDGE,
      };
  }
}

const ORIGINS: Record<PopoverPlacement, string> = {
  'bottom-start': 'origin-top-left',
  'bottom-end': 'origin-top-right',
  'top-start': 'origin-bottom-left',
  'top-end': 'origin-bottom-right',
  'right-end': 'origin-bottom-left',
};

export interface PopoverTriggerProps {
  ref: (node: HTMLElement | null) => void;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
}

interface PopoverProps {
  /** Desktop placement relative to the trigger. */
  placement?: PopoverPlacement;
  role?: 'menu' | 'dialog';
  label: string;
  className?: string;
  /** Controlled mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: (props: PopoverTriggerProps, state: { open: boolean }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
}

/**
 * Floating surface anchored to its trigger. Desktop: a popover in a portal (never
 * clipped). Phones: the same content in a bottom sheet — menus become action sheets.
 */
export function Popover({
  placement = 'bottom-end',
  role = 'dialog',
  label,
  className,
  open: controlledOpen,
  onOpenChange,
  trigger,
  children,
}: PopoverProps) {
  const isDesktop = useIsDesktop();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [style, setStyle] = useState<CSSProperties>({});
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null);
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      setInnerOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  useDismiss(open && isDesktop, [triggerElement, contentElement], close);

  useLayoutEffect(() => {
    if (!open || !isDesktop || !triggerElement) return;
    const update = () => setStyle(computeStyle(triggerElement.getBoundingClientRect(), placement));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, isDesktop, placement, triggerElement]);

  const content = typeof children === 'function' ? children(close) : children;

  return (
    <>
      {trigger(
        {
          ref: setTriggerElement,
          onClick: () => setOpen(!open),
          'aria-expanded': open,
          'aria-haspopup': role,
        },
        { open },
      )}
      {isDesktop ? (
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={setContentElement}
                role={role}
                aria-label={label}
                style={style}
                variants={popVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={cn(
                  'fixed z-[60] scroll-area rounded-card border border-line/80 bg-surface shadow-float',
                  ORIGINS[placement],
                  className,
                )}
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )
      ) : (
        <ModalSurface open={open} onClose={close} label={label}>
          <div className="min-h-0 flex-1 scroll-area pb-[max(12px,env(safe-area-inset-bottom))]">
            {content}
          </div>
        </ModalSurface>
      )}
    </>
  );
}
