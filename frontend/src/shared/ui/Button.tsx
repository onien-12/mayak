import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';

import { buttonClasses, type ButtonClassOptions, type ButtonSize } from './buttonClasses';
import { Spinner } from './Spinner';

const ICON_SIZES: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 18 };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonClassOptions {
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size = 'md',
  block,
  className,
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const iconSize = ICON_SIZES[size];
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {loading ? (
        <Spinner size={iconSize} className="text-current" />
      ) : (
        Icon && <Icon size={iconSize} aria-hidden />
      )}
      {children}
      {IconRight && <IconRight size={iconSize} aria-hidden />}
    </button>
  );
}
