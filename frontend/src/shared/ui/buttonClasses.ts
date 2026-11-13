import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white shadow-card hover:bg-brand-hover',
  secondary: 'border border-line bg-surface text-ink hover:border-ink-faint/60 hover:bg-canvas',
  ghost: 'text-ink-soft hover:bg-ink/5 hover:text-ink',
  danger: 'bg-danger text-white shadow-card hover:bg-danger-ink',
  accent: 'bg-beam text-ink shadow-card hover:brightness-95',
  soft: 'bg-brand-soft text-brand hover:bg-brand/15',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-10 gap-1.5 px-3 text-sm lg:h-9',
  md: 'h-11 gap-2 px-4 text-base',
  lg: 'h-12 gap-2 px-5 text-base',
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}

/** Button look for non-button elements (`<Link className={buttonClasses()}>`). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: ButtonClassOptions = {}): string {
  return cn(
    'tap-target relative inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,transform,filter] duration-150 ease-out active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  );
}
