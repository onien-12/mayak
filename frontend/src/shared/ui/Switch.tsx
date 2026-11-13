import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Labelled toggle row: text on the left, switch on the right. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: SwitchProps) {
  return (
    <label
      className={cn(
        'flex min-h-11 items-center justify-between gap-4 py-1.5',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-base text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-faint">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'relative h-6 w-10.5 shrink-0 rounded-full bg-line transition-colors duration-150',
          'peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand',
          'after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-card after:transition-transform after:duration-150',
          checked && 'after:translate-x-4.5',
        )}
      />
    </label>
  );
}
