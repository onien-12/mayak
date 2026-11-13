import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

interface FieldProps {
  label?: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error line. Pair with `Input`, `Textarea`, `Select`. */
export function Field({ label, htmlFor, hint, error, optional, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="flex items-baseline gap-1.5 text-sm font-medium text-ink"
        >
          {label}
          {optional && <span className="text-xs font-normal text-ink-faint">необязательно</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger-ink">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-faint">{hint}</p>
      )}
    </div>
  );
}
