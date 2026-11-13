import { motion } from 'motion/react';
import { useId } from 'react';

import { cn } from '../lib/cn';
import { SPRING } from './motion';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  /** Accessible name of the group. */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Radio group with a thumb that slides between the options. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const thumbId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex rounded-control bg-canvas p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'tap-target relative min-w-0 flex-auto rounded-[9px] px-2.5 font-medium transition-colors duration-150',
              size === 'sm' ? 'h-9 text-xs lg:h-8' : 'h-10 text-sm lg:h-9',
              selected ? 'text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            {selected && (
              <motion.span
                layoutId={thumbId}
                transition={SPRING.layout}
                className="absolute inset-0 rounded-[9px] bg-surface shadow-card"
              />
            )}
            <span className="relative block truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
