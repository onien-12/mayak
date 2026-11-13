import { ArrowLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { cn } from '../lib/cn';
import { IconButton } from './IconButton';

interface PageLayoutProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shows a back arrow (e.g. case page → queue). */
  onBack?: () => void;
  /** Buttons on the right side of the header, before the close button. */
  actions?: ReactNode;
  /** Non-scrolling block under the title (tabs, filters). */
  toolbar?: ReactNode;
  /** Content width: `md` for reading pages, `lg` for dashboards and tables. */
  width?: 'md' | 'lg';
  children: ReactNode;
}

/**
 * Standard frame of every overlay page (profile, moderation, statistics): header with
 * title / actions / close-to-map button and a centred scrollable body.
 */
export function PageLayout({
  title,
  subtitle,
  onBack,
  actions,
  toolbar,
  width = 'lg',
  children,
}: PageLayoutProps) {
  const navigate = useNavigate();
  const container = cn('mx-auto w-full px-4 lg:px-8', width === 'md' ? 'max-w-3xl' : 'max-w-6xl');

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line/70">
        <div
          className={cn(
            container,
            'flex items-center gap-3 pt-[max(12px,env(safe-area-inset-top))] pb-3 lg:py-5',
          )}
        >
          {onBack && (
            <IconButton icon={ArrowLeft} label="Назад" onClick={onBack} className="-ml-2" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-semibold text-ink lg:text-2xl">
              {title}
            </h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-ink-soft">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          <IconButton
            icon={X}
            label="Закрыть и вернуться к карте"
            onClick={() => navigate('/')}
            className="-mr-2"
          />
        </div>
        {toolbar && <div className={cn(container, 'pb-3')}>{toolbar}</div>}
      </header>
      <div className="min-h-0 flex-1 scroll-area">
        <div className={cn(container, 'py-5 lg:py-8')}>{children}</div>
      </div>
    </section>
  );
}
