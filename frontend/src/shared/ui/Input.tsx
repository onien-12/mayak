import type { LucideIcon } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

import { cn } from '../lib/cn';

export const controlClasses =
  'w-full rounded-control border border-line bg-surface text-[16px] text-ink placeholder:text-ink-faint lg:text-base ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-ink-faint/70 ' +
  'focus:border-brand focus:ring-3 focus:ring-brand/12 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint ' +
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/15';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  /** Element rendered inside the field on the right (clear button, unit…). */
  trailing?: ReactNode;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ icon: Icon, trailing, invalid, className, ...rest }: InputProps) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          size={18}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 z-10 -translate-y-1/2 text-ink-faint"
        />
      )}
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          controlClasses,
          'h-12 px-3.5 lg:h-11',
          Icon && 'pl-10.5',
          trailing && 'pr-11',
          className,
        )}
        {...rest}
      />
      {trailing && (
        <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
          {trailing}
        </div>
      )}
    </div>
  );
}
