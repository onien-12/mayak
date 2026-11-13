import { X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { TONES, type Tone } from '../lib/tones';

interface ChipProps {
  selected?: boolean;
  onClick?: () => void;
  /** Colour used when selected. */
  tone?: Tone;
  icon?: LucideIcon;
  /** Shows a trailing ✕ and calls this instead of `onClick` when pressed on it. */
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** Toggleable pill for filters, tags and categories. */
export function Chip({
  selected = false,
  onClick,
  tone = 'brand',
  icon: Icon,
  onRemove,
  disabled,
  className,
  children,
}: ChipProps) {
  const classes = cn(
    'tap-target relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap lg:h-9 lg:px-3',
    'transition-[background-color,border-color,color,transform] duration-150',
    selected ? cn(TONES[tone].soft, TONES[tone].border) : 'border-line bg-surface text-ink-soft',
    onClick && 'active:scale-[0.97]',
    onClick && !selected && 'hover:border-ink-faint/60 hover:text-ink',
    disabled && 'pointer-events-none opacity-50',
    className,
  );
  const content = (
    <>
      {Icon && <Icon size={15} aria-hidden className="shrink-0" />}
      {children}
    </>
  );

  if (onRemove) {
    return (
      <span className={cn(classes, 'pr-1')}>
        {content}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Убрать"
          className="inline-flex size-6 items-center justify-center rounded-full hover:bg-ink/10"
        >
          <X size={13} aria-hidden />
        </button>
      </span>
    );
  }

  if (!onClick) return <span className={classes}>{content}</span>;

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={classes}
    >
      {content}
    </button>
  );
}
