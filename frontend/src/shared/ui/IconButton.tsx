import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';

import { cn } from '../lib/cn';

type IconButtonVariant = 'ghost' | 'surface' | 'solid' | 'overlay';
type IconButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-ink-soft hover:bg-ink/5 hover:text-ink',
  surface: 'glass border border-line/70 text-ink shadow-card hover:bg-surface',
  solid: 'bg-brand text-white hover:bg-brand-hover',
  overlay:
    'bg-ink/45 text-white backdrop-blur-sm hover:bg-ink/60 lite:bg-ink/60 lite:hover:bg-ink/70',
};

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-11',
};

const ICON_SIZES: Record<IconButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Accessible name — icon buttons have no visible text. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
  iconClassName?: string;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  iconClassName,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cn(
        'tap-target relative inline-flex shrink-0 items-center justify-center rounded-control transition-[background-color,color,transform] duration-150 ease-out active:scale-90',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        active && variant === 'ghost' && 'bg-brand-soft text-brand',
        className,
      )}
      {...rest}
    >
      <Icon size={ICON_SIZES[size]} aria-hidden className={iconClassName} />
    </button>
  );
}
