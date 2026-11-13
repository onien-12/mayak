import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { IconButton } from './IconButton';

interface PanelLayoutProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shows a back arrow in the header. */
  onBack?: () => void;
  backLabel?: string;
  /** Icon buttons on the right side of the header. */
  actions?: ReactNode;
  /** Non-scrolling block under the title (search field, tabs, filters). */
  toolbar?: ReactNode;
  /** Sticky block under the scroll area — the primary action, in the thumb zone on phones. */
  footer?: ReactNode;
  /** Removes the default body padding (edge-to-edge content such as galleries). */
  flush?: boolean;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * Standard frame of every panel section: header (back / title / actions), optional
 * toolbar, scrollable body, optional sticky footer.
 *
 * Phones: the frame lives in the bottom sheet — the header is the drag handle
 * (`data-sheet-handle`) and stays visible at the `peek` snap; the body scrolls only when the
 * sheet is at full height (`data-sheet-scroll`).
 */
export function PanelLayout({
  title,
  subtitle,
  onBack,
  backLabel = 'Назад',
  actions,
  toolbar,
  footer,
  flush = false,
  bodyClassName,
  children,
}: PanelLayoutProps) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header
        data-sheet-handle
        className="flex min-h-[74px] shrink-0 items-center gap-2 px-4 pb-3 lg:min-h-14 lg:px-5 lg:pt-4"
      >
        {onBack && (
          <IconButton icon={ArrowLeft} label={backLabel} onClick={onBack} className="-ml-2" />
        )}
        <div className="min-w-0 flex-1">
          {/* A long name wraps to a second line; only a third one is cut. */}
          <h1 className="line-clamp-2 font-display text-lg leading-tight font-semibold wrap-anywhere text-ink">
            {title}
          </h1>
          {subtitle && <p className="truncate text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions && <div className="-mr-2 flex shrink-0 items-center gap-0.5">{actions}</div>}
      </header>
      {toolbar && <div className="shrink-0 px-4 pb-3 lg:px-5">{toolbar}</div>}
      <div
        data-sheet-scroll
        className={cn('min-h-0 flex-1 scroll-area', !flush && 'px-4 pb-6 lg:px-5', bodyClassName)}
      >
        {children}
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-line bg-surface/90 px-4 py-3 lg:px-5">
          {footer}
        </footer>
      )}
    </section>
  );
}
