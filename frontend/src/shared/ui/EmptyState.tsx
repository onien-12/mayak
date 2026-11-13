import { CloudOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { ApiError } from '../api/client';
import { cn } from '../lib/cn';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Next step for the user: usually a `<Button>`. */
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <div
        className={cn(
          'mb-4 flex size-14 items-center justify-center rounded-2xl',
          tone === 'danger' ? 'bg-danger-soft text-danger-ink' : 'bg-brand-soft text-brand',
        )}
      >
        <Icon size={26} aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}

/** Friendly failure state with the backend message (when there is one) and a retry action. */
export function ErrorState({
  error,
  title = 'Не получилось загрузить',
  onRetry,
  className,
}: ErrorStateProps) {
  const description =
    error instanceof ApiError ? error.detail : 'Проверьте соединение и попробуйте ещё раз.';
  return (
    <EmptyState
      icon={CloudOff}
      tone="danger"
      title={title}
      description={description}
      className={className}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Повторить
          </Button>
        )
      }
    />
  );
}
