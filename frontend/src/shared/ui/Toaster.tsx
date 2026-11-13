import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '../lib/cn';
import { SPRING, TWEEN } from './motion';
import { useToastStore, type ToastKind } from './toastStore';

const KIND = {
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: CircleAlert, className: 'text-danger' },
  info: { icon: Info, className: 'text-beam' },
} satisfies Record<ToastKind, unknown>;

/**
 * Toast viewport — mounted once in the app shell. On phones toasts slide in above the tab bar
 * and the footer of a sheet, so they never cover its primary button; and only their own buttons
 * take taps — the body lets them through to whatever is under it.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(152px+env(safe-area-inset-bottom,0px))] z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const { icon: Icon, className } = KIND[item.kind];
          return (
            <motion.div
              key={item.id}
              layout
              role={item.kind === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING.sheet }}
              exit={{ opacity: 0, y: 12, scale: 0.96, transition: TWEEN.fast }}
              className="flex max-w-md items-center gap-2.5 rounded-control bg-ink py-2 pr-1.5 pl-3.5 text-sm font-medium text-white shadow-float"
            >
              <Icon size={18} aria-hidden className={cn('shrink-0', className)} />
              <span className="min-w-0">{item.message}</span>
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="pointer-events-auto tap-target relative -my-1 inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 font-semibold text-beam transition-colors hover:bg-white/10"
                >
                  {item.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Скрыть"
                onClick={() => dismiss(item.id)}
                className="pointer-events-auto tap-target relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={15} aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
