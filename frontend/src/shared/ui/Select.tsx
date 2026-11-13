import { ChevronDown } from 'lucide-react';
import type { Ref, SelectHTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import { controlClasses } from './Input';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ options, placeholder, invalid, className, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(controlClasses, 'h-12 appearance-none pr-10 pl-3.5 lg:h-11', className)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={18}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-faint"
      />
    </div>
  );
}
