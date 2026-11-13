import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { IconButton } from './IconButton';
import { ModalSurface } from './ModalSurface';

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof SIZES;
  /** Sticky action row under the scrollable body — keeps the primary action in the thumb zone. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Dialog. On phones it is a bottom sheet (spring in, flick down to dismiss); on wider
 * screens a centred card. Keep it mounted and toggle `open` to get the exit animation.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  const titleId = useId();

  return (
    <ModalSurface open={open} onClose={onClose} labelledBy={titleId} widthClassName={SIZES[size]}>
      <header className="flex items-start gap-3 px-4 pb-3 sm:px-6 sm:pt-6">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
        </div>
        <IconButton icon={X} label="Закрыть" onClick={onClose} className="-mt-1 -mr-2" />
      </header>
      <div className="flex-1 scroll-area px-4 pb-5 sm:px-6 sm:pb-6">{children}</div>
      {footer && (
        <footer className="flex gap-2 border-t border-line px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:justify-end sm:px-6 sm:pb-4 [&>*]:flex-1 sm:[&>*]:flex-none">
          {footer}
        </footer>
      )}
    </ModalSurface>
  );
}
